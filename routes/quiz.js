const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');  // Adjust path if needed
const authMiddleware = require('../middleware/authMiddleware');

// Admin: Add quiz for an event
router.post('/add/:eventId', authMiddleware, async (req, res) => {
  try {
    const { questions } = req.body;
    const eventId = req.params.eventId;

    // Check if quiz already exists for this event
    const { data: existingQuiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('event_id', eventId)
      .single();

    let result;
    if (existingQuiz) {
      // Update existing quiz
      result = await supabase
        .from('quizzes')
        .update({ 
          questions,
          updated_at: new Date().toISOString()
        })
        .eq('event_id', eventId)
        .select();
    } else {
      // Create new quiz
      result = await supabase
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

// User: Fetch quiz for an event
router.get('/:eventId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('event_id', req.params.eventId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error;
    }

    if (!data) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Fetch quiz error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz', error: error.message });
  }
});

// Submit quiz answers
router.post('/submit/:eventId', authMiddleware, async (req, res) => {
  try {
    const { answers, score } = req.body;
    const eventId = req.params.eventId;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('quiz_submissions')
      .insert([{
        event_id: eventId,
        user_id: userId,
        answers,
        score
      }])
      .select();

    if (error) throw error;

    res.status(201).json({ message: 'Quiz submitted successfully', submission: data[0] });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ message: 'Failed to submit quiz', error: error.message });
  }
});

module.exports = router;