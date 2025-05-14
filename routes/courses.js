const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
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
            message: "You are not authorized to delete this course",
          });
        }
      }

      // Delete course videos first
      const { error: videoDeleteError } = await supabase
        .from("course_videos")
        .delete()
        .eq("course_id", id);

      if (videoDeleteError) throw videoDeleteError;

      // Then delete the course
      const { error } = await supabase.from("courses").delete().eq("id", id);

      if (error) throw error;

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

module.exports = router;
