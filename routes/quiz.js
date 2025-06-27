const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase'); // Make sure you import supabaseAdmin
const authMiddleware = require('../middleware/authMiddleware');

// Admin: Add quiz for an event
router.post('/add/:eventId', authMiddleware, async (req, res) => {
  try {
    const { questions } = req.body;
    const eventId = req.params.eventId;

    // Use supabaseAdmin for admin operations
    const { data: existingQuiz } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('event_id', eventId)
      .single();

    let result;
    if (existingQuiz) {
      result = await supabaseAdmin
        .from('quizzes')
        .update({ 
          questions,
          updated_at: new Date().toISOString()
        })
        .eq('event_id', eventId)
        .select();
    } else {
      result = await supabaseAdmin
        .from('quizzes')
        .insert([{ 
          event_id: eventId, 
          questions 
        }])
        .select();
    }

    if (result.error) throw result.error;
    res.status(200).json({ message: 'Quiz saved successfully', quiz: result.data[0] });
  } catch (error) {
    console.error('Add quiz error:', error);
    res.status(500).json({ message: 'Failed to add quiz', error: error.message });
  }
});

// User: Fetch quiz for an event with attempt status
router.get('/:eventId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const eventId = req.params.eventId;

    // Use supabaseAdmin to bypass RLS
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (quizError && quizError.code !== 'PGRST116') {
      throw quizError;
    }

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Get user's previous attempts using supabaseAdmin
    const { data: attempts, error: attemptsError } = await supabaseAdmin
      .from('quiz_submissions')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
    }

    const response = {
      ...quiz,
      attempts: attempts || [],
      attemptCount: attempts ? attempts.length : 0,
      maxAttempts: 2,
      canAttempt: !attempts || attempts.length < 2
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Fetch quiz error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz', error: error.message });
  }
});

// Submit quiz answers - FIXED VERSION
router.post('/submit/:eventId', authMiddleware, async (req, res) => {
  try {
    const { answers, score, totalQuestions } = req.body;
    const eventId = req.params.eventId;
    const userId = req.user.id;

    console.log('Quiz submission data:', { eventId, userId, score, totalQuestions });

    // Check existing attempts using supabaseAdmin
    const { data: existingAttempts, error: checkError } = await supabaseAdmin
      .from('quiz_submissions')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (checkError) {
      console.error('Error checking attempts:', checkError);
      return res.status(500).json({ message: 'Error checking previous attempts' });
    }

    if (existingAttempts && existingAttempts.length >= 2) {
      return res.status(400).json({ 
        message: 'Maximum attempts reached. You can only attempt this quiz 2 times.' 
      });
    }

    // Calculate percentage
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const status = percentage >= 60 ? 'passed' : 'failed';
    const attemptNumber = existingAttempts ? existingAttempts.length + 1 : 1;

    // Insert using supabaseAdmin to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('quiz_submissions')
      .insert([{
        event_id: eventId,
        user_id: userId,
        answers,
        score,
        total_questions: totalQuestions,
        percentage,
        status,
        attempt_number: attemptNumber,
        submitted_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Insert error:', error);
      throw error;
    }

    console.log('Quiz submission successful:', data[0]);

    res.status(201).json({ 
      message: 'Quiz submitted successfully', 
      submission: data[0],
      canRetry: attemptNumber < 2
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ message: 'Failed to submit quiz', error: error.message });
  }
});

// Get quiz results for a user
router.get('/:eventId/results', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const eventId = req.params.eventId;

    // Use supabaseAdmin to bypass RLS
    const { data: submissions, error } = await supabaseAdmin
      .from('quiz_submissions')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      submissions: submissions || [],
      totalAttempts: submissions ? submissions.length : 0,
      maxAttempts: 2
    });
  } catch (error) {
    console.error('Get quiz results error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz results', error: error.message });
  }
});

module.exports = router;