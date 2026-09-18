import Quiz from "../models/Quiz.js";

export const createQuiz = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      difficulty,
      questions,
      timerMode,
      totalTimeLimit,
      visibility,
      status,
    } = req.body;

    // Basic required-field validation
    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: "Title and category are required",
      });
    }

    // Make sure questions is actually an array
    if (questions && !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        message: "Questions must be an array",
      });
    }

    // Validate every question before saving
    if (questions?.length) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (!question.questionText) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} must have question text`,
          });
        }

        if (
          !Array.isArray(question.options) ||
          question.options.length < 2
        ) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} must have at least 2 options`,
          });
        }

        if (
          question.correctOption === undefined ||
          question.correctOption < 0 ||
          question.correctOption >= question.options.length
        ) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} has an invalid correct option`,
          });
        }
      }
    }

    // Whole-quiz timer needs a total time
    if (
      timerMode === "whole-quiz" &&
      (!totalTimeLimit || totalTimeLimit < 1)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A whole-quiz timer requires a valid total time limit",
      });
    }

    const quiz = await Quiz.create({
      title,
      description,
      category,
      difficulty,
      questions,
      timerMode,
      totalTimeLimit,
      visibility,
      status,

      // Very important:
      // creator comes from authenticated user,
      // not from req.body.
      creator: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Quiz created successfully",
      quiz,
    });
  } catch (error) {
    console.error("Create quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while creating the quiz",
    });
  }
};