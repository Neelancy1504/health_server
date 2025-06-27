const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { verifyRole } = require("../middleware/roleMiddleware"); // Fixed import
const { supabase } = require("../config/supabase");

// Get all courses
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select(
        `
        *,
        videos:course_videos(*)
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get course by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("courses")
      .select(
        `
        *,
        videos:course_videos(*)
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new course (admin or doctor)
router.post(
  "/",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { title, description, category, level, price, isPaid } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Course title is required" });
      }

      // Get user details to ensure we have a name
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("name")
        .eq("id", req.user.id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
        return res
          .status(500)
          .json({ message: "Failed to retrieve user information" });
      }

      const creatorName = userData?.name || "Unknown User";
      console.log("Creating course with creator name:", creatorName);

      const { data, error } = await supabase
        .from("courses")
        .insert({
          title,
          description,
          category,
          creator_id: req.user.id,
          creator_name: creatorName, // Use the retrieved name
          tags: req.body.tags || [],
          thumbnail_url: req.body.thumbnail_url || null,
          status: req.body.status || "published",
        })
        .select();

      if (error) throw error;

      res.status(201).json(data[0]);
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Add a video to a course
router.post(
  "/:id/videos",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        video_url,
        thumbnail_url,
        sequence_order,
        duration,
      } = req.body;

      console.log(
        `Attempting to add video to course ${id} by user ${req.user.id}`
      );

      // FIXED: Use correct field names (creator_id instead of creater_id)
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select("id, creator_id")
        .eq("id", id)
        .single();

      if (courseError) {
        console.error("Error fetching course:", courseError);
        return res.status(404).json({ message: "Course not found" });
      }

      if (!course) {
        console.error(`Course with ID ${id} not found`);
        return res.status(404).json({ message: "Course not found" });
      }

      console.log("Course found:", course);

      // FIXED: Match the field name with what's in the database (creator_id)
      if (req.user.role !== "admin" && course.creator_id !== req.user.id) {
        return res.status(403).json({
          message: "You are not authorized to add videos to this course",
        });
      }

      // Create video
      const { data, error } = await supabase
        .from("course_videos")
        .insert({
          course_id: id,
          title,
          description,
          video_url,
          thumbnail_url,
          sequence_order,
          duration: duration || 0,
        })
        .select();

      if (error) {
        console.error("Error inserting video:", error);
        throw error;
      }

      res.status(201).json(data[0]);
    } catch (error) {
      console.error("Error adding video to course:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Update course details
router.patch(
  "/:id",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, category, level, price, isPaid } = req.body;

      // Verify ownership if not admin
      if (req.user.role !== "admin") {
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("created_by")
          .eq("id", id)
          .single();

        if (courseError || !course) {
          return res.status(404).json({ message: "Course not found" });
        }

        if (course.created_by !== req.user.id) {
          return res.status(403).json({
            message: "You are not authorized to update this course",
          });
        }
      }

      const { data, error } = await supabase
        .from("courses")
        .update({
          title,
          description,
          category,
          level,
          price,
          is_paid: isPaid,
          updated_at: new Date(),
        })
        .eq("id", id)
        .select();

      if (error) throw error;

      res.json(data[0]);
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get courses created by current user
router.get("/my-courses", verifyToken, async (req, res) => {
  try {
    const { data: courses, error } = await supabase
      .from("courses")
      .select("*")
      .eq("creator_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(courses);
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a course
router.delete(
  "/:id",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`Attempting to delete course ${id} by user ${req.user.id}`);

      // Verify ownership if not admin
      if (req.user.role !== "admin") {
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("creator_id")
          .eq("id", id)
          .single();

        if (courseError || !course) {
          console.log(`Course ${id} not found or error:`, courseError);
          return res.status(404).json({ message: "Course not found" });
        }

        if (course.creator_id !== req.user.id) {
          console.log(`User ${req.user.id} not authorized to delete course ${id}`);
          return res.status(403).json({
            message: "You are not authorized to delete this course",
          });
        }
      }

      console.log(`Deleting course ${id} and related data...`);

      // Delete course videos first (cascade should handle this, but let's be explicit)
      const { error: videoDeleteError } = await supabase
        .from("course_videos")
        .delete()
        .eq("course_id", id);

      if (videoDeleteError) {
        console.error("Error deleting course videos:", videoDeleteError);
        // Continue anyway - the course deletion might still work
      }

      // Delete course comments
      const { error: commentsDeleteError } = await supabase
        .from("course_comments")
        .delete()
        .eq("course_id", id);

      if (commentsDeleteError) {
        console.error("Error deleting course comments:", commentsDeleteError);
        // Continue anyway
      }

      // Delete course discussions
      const { error: discussionsDeleteError } = await supabase
        .from("course_discussions")
        .delete()
        .eq("course_id", id);

      if (discussionsDeleteError) {
        console.error("Error deleting course discussions:", discussionsDeleteError);
        // Continue anyway
      }

      // Finally, delete the course
      const { error } = await supabase
        .from("courses")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting course:", error);
        throw error;
      }

      console.log(`Course ${id} deleted successfully`);
      res.status(200).json({ message: "Course deleted successfully" });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete a video from a course
router.delete(
  "/:courseId/videos/:videoId",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { courseId, videoId } = req.params;

      // Verify ownership if not admin
      if (req.user.role !== "admin") {
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("created_by")
          .eq("id", courseId)
          .single();

        if (courseError || !course) {
          return res.status(404).json({ message: "Course not found" });
        }

        if (course.created_by !== req.user.id) {
          return res.status(403).json({
            message: "You are not authorized to delete videos from this course",
          });
        }
      }

      const { error } = await supabase
        .from("course_videos")
        .delete()
        .eq("id", videoId)
        .eq("course_id", courseId);

      if (error) throw error;

      res.status(200).json({ message: "Video deleted successfully" });
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Update the discussions endpoints to support replies

// Get discussions for a course (with optional video filter)
router.get("/:courseId/discussions", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { video_id } = req.query;

    console.log('Getting discussions for course:', courseId, 'video:', video_id);

    // Use a more explicit approach to avoid foreign key relationship issues
    const { data: discussions, error } = await supabase
      .from("course_discussions")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    // Filter by video_id if provided
    let filteredDiscussions = discussions;
    if (video_id && video_id !== 'null' && video_id !== 'undefined') {
      filteredDiscussions = discussions.filter(d => d.video_id === video_id);
    }

    // Get user information separately to avoid foreign key issues
    const userIds = [...new Set(filteredDiscussions.map(d => d.user_id))];
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("id, name, role, avatar_url")
      .in("id", userIds);

    if (userError) {
      console.error('User fetch error:', userError);
      // Continue without user data instead of failing
    }

    // Create a user lookup map
    const userMap = {};
    if (users) {
      users.forEach(user => {
        userMap[user.id] = user;
      });
    }

    // Format the response with user data
    const formattedDiscussions = filteredDiscussions.map((discussion) => ({
      id: discussion.id,
      content: discussion.content,
      created_at: discussion.created_at,
      user_id: discussion.user_id,
      parent_id: discussion.parent_id,
      video_id: discussion.video_id,
      user_name: userMap[discussion.user_id]?.name || "Unknown User",
      user_avatar: userMap[discussion.user_id]?.avatar_url || null,
      role: userMap[discussion.user_id]?.role || null,
    }));

    console.log('Returning discussions:', formattedDiscussions.length);
    res.json(formattedDiscussions);
  } catch (error) {
    console.error("Error fetching course discussions:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a discussion to a course (keep original functionality)
router.post("/:courseId/discussions", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { content, parent_id, video_id } = req.body;
    const userId = req.user.id;
    
    console.log('Adding discussion:', {
      courseId,
      userId,
      content,
      parent_id,
      video_id
    });

    // Get user information
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("name, role")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("Error fetching user data:", userError);
      return res.status(500).json({ 
        message: "Failed to retrieve user information" 
      });
    }

    // For replies: Check if parent comment exists and get its author
    let parentAuthorId = null;
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from("course_discussions")
        .select("id, user_id")
        .eq("id", parent_id)
        .eq("course_id", courseId)
        .single();

      if (parentError || !parentComment) {
        return res.status(400).json({ message: "Parent comment not found" });
      }
      
      parentAuthorId = parentComment.user_id;
    } 
    // For top-level comments: Get course creator ID
    else {
      // Get course creator ID for notification
      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .select("creator_id, title")
        .eq("id", courseId)
        .single();
        
      if (courseError) {
        console.error("Error fetching course data:", courseError);
      } else if (courseData) {
        // Store course info for notification
        courseCreatorId = courseData.creator_id;
        courseTitle = courseData.title;
      }
    }

    // Insert the discussion
    const insertData = {
      course_id: courseId,
      user_id: userId,
      content,
      parent_id: parent_id || null,
      video_id: video_id || null,
    };

    const { data, error } = await supabase
      .from("course_discussions")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      throw error;
    }

    console.log('Successfully added discussion:', data);

    // NOTIFICATION SYSTEM
    try {
      const notificationService = require('../services/notificationService');
      
      // 1. If this is a reply, notify the original comment author
      if (parent_id && parentAuthorId && parentAuthorId !== userId) {
        await notificationService.sendToUser(
          parentAuthorId,
          "New Reply to Your Comment",
          `${userData.name} replied to your comment in ${courseTitle || "a course"}`,
          {
            type: "course_comment_reply",
            id: courseId,
            comment_id: data.id,
            video_id: video_id || null,
            action: "view_discussion"
          }
        );
        console.log(`Notification sent to comment author: ${parentAuthorId}`);
      } 
      // 2. If this is a new comment, notify the course creator
      else if (!parent_id && courseCreatorId && courseCreatorId !== userId) {
        await notificationService.sendToUser(
          courseCreatorId,
          "New Comment on Your Course",
          `${userData.name} commented on your course: ${courseTitle || "your course"}`,
          {
            type: "course_new_comment",
            id: courseId,
            comment_id: data.id,
            video_id: video_id || null,
            action: "view_discussion"
          }
        );
        console.log(`Notification sent to course creator: ${courseCreatorId}`);
      }
    } catch (notificationError) {
      // Don't fail the comment creation if notification fails
      console.error("Error sending notification:", notificationError);
    }

    // Return the discussion with user data
    const response = {
      ...data,
      user_name: userData.name,
      role: userData.role,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Error adding course discussion:", error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a discussion from a course
router.delete(
  "/:courseId/discussions/:discussionId",
  verifyToken,
  async (req, res) => {
    try {
      const { discussionId } = req.params;
      const userId = req.user.id;

      // Check if user is the owner of the comment or an admin
      if (req.user.role !== "admin") {
        const { data: discussion, error: findError } = await supabase
          .from("course_discussions")
          .select("user_id")
          .eq("id", discussionId)
          .single();

        if (findError) throw findError;

        if (discussion.user_id !== userId) {
          return res.status(403).json({
            message: "You are not authorized to delete this comment",
          });
        }
      }

      const { error } = await supabase
        .from("course_discussions")
        .delete()
        .eq("id", discussionId);

      if (error) throw error;

      res.status(200).json({ message: "Discussion deleted successfully" });
    } catch (error) {
      console.error("Error deleting course discussion:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get course comments - Fixed to join tables manually
router.get("/:courseId/comments", async (req, res) => {
  try {
    const { courseId } = req.params;

    // Using join instead of nested select
    const { data, error } = await supabase
      .from("course_comments")
      .select(`*, user:users!course_comments_user_id_fkey(name, avatar_url)`)
      .eq("course_id", courseId)
      .is("video_id", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      throw error;
    }

    // Format the response
    const formattedComments = data.map(comment => ({
      ...comment,
      user_name: comment.user?.name || "Unknown User",
      user_avatar: comment.user?.avatar_url || null,
    }));

    // Remove the user object to avoid duplication
    formattedComments.forEach(comment => {
      delete comment.user;
    });

    res.json(formattedComments);
  } catch (error) {
    console.error("Error getting course comments:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get video comments - Fixed to join tables manually
router.get("/:courseId/videos/:videoId/comments", async (req, res) => {
  try {
    const { courseId, videoId } = req.params;

    // Using join instead of nested select
    const { data, error } = await supabase
      .from("course_comments")
      .select(`*, user:users!course_comments_user_id_fkey(name, avatar_url)`)
      .eq("course_id", courseId)
      .eq("video_id", videoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      throw error;
    }

    // Format the response
    const formattedComments = data.map(comment => ({
      ...comment,
      user_name: comment.user?.name || "Unknown User",
      user_avatar: comment.user?.avatar_url || null,
    }));

    // Remove the user object to avoid duplication
    formattedComments.forEach(comment => {
      delete comment.user;
    });

    res.json(formattedComments);
  } catch (error) {
    console.error("Error getting video comments:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add course comment
router.post("/:courseId/comments", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    // First insert the comment
    const { data, error } = await supabase
      .from("course_comments")
      .insert({
        course_id: courseId,
        user_id: userId,
        content: content.trim(),
        video_id: null,
      })
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Failed to insert comment");
    }

    // Then fetch user info to return complete comment data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("name, avatar_url")
      .eq("id", userId)
      .single();

    if (userError) throw userError;

    // Format the response
    const comment = {
      ...data[0],
      user_name: userData?.name || "Unknown User",
      user_avatar: userData?.avatar_url || null,
    };

    res.status(201).json(comment);
  } catch (error) {
    console.error("Error adding course comment:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add video comment
router.post("/:courseId/videos/:videoId/comments", verifyToken, async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    // First insert the comment
    const { data, error } = await supabase
      .from("course_comments")
      .insert({
        course_id: courseId,
        video_id: videoId,
        user_id: userId,
        content: content.trim(),
      })
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Failed to insert comment");
    }

    // Then fetch user info to return complete comment data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("name, avatar_url")
      .eq("id", userId)
      .single();

    if (userError) throw userError;

    // Format the response
    const comment = {
      ...data[0],
      user_name: userData?.name || "Unknown User",
      user_avatar: userData?.avatar_url || null,
    };

    res.status(201).json(comment);
  } catch (error) {
    console.error("Error adding video comment:", error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/:courseId/presence", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { videoId, userId, isOnline } = req.body;
    
    if (isOnline) {
      // Upsert user presence
      const { error } = await supabase
        .from("user_presence")
        .upsert({
          user_id: userId,
          course_id: courseId,
          video_id: videoId || null,
          last_seen: new Date().toISOString(),
          is_online: true
        });
      if (error) {
        console.error("Error upserting presence:", error);
        return res.status(500).json({ message: "Failed to update presence" });
      }

      return res.status(200).json({ message: "Presence updated" });
    } else {
      // Mark user as offline
      const { error } = await supabase
        .from("user_presence")
        .update({ is_online: false })
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .eq("video_id", videoId || null);

      if (error) {
        console.error("Error updating presence:", error);
        return res.status(500).json({ message: "Failed to update presence" });
      }

      return res.status(200).json({ message: "User marked as offline" });
    }
  } catch (error) {
    console.error("Error updating user presence:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
