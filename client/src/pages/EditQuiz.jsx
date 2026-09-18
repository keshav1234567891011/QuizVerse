import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../config/api.js";

function EditQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // -------------------------
  // LOAD EXISTING QUIZ
  // -------------------------

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        const response = await fetch(`${API_URL}/api/quizzes/${id}`, {
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.message || "Could not load quiz.");
          return;
        }

        const quiz = data.quiz;

        setFormData({
          title: quiz.title || "",
          description: quiz.description || "",
          category: quiz.category || "",
          difficulty: quiz.difficulty || "medium",
          timerMode: quiz.timerMode || "per-question",
          totalTimeLimit: quiz.totalTimeLimit ?? "",
          visibility: quiz.visibility || "private",
          status: quiz.status || "draft",

          questions:
            quiz.questions?.length > 0
              ? quiz.questions.map((question) => ({
                  questionText: question.questionText || "",

                  options:
                    question.options?.length > 0
                      ? question.options
                      : ["", "", "", ""],

                  correctOption: question.correctOption ?? 0,

                  marks: question.marks ?? 1,

                  timeLimit: question.timeLimit ?? 30,
                }))
              : [
                  {
                    questionText: "",
                    options: ["", "", "", ""],
                    correctOption: 0,
                    marks: 1,
                    timeLimit: 30,
                  },
                ],
        });
      } catch (error) {
        console.error("Load quiz error:", error);

        setMessage("Could not connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    loadQuiz();
  }, [id]);

  // -------------------------
  // BASIC FIELDS
  // -------------------------

  const handleBasicChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // -------------------------
  // QUESTION TEXT
  // -------------------------

  const handleQuestionTextChange = (questionIndex, value) => {
    setFormData((previous) => {
      const questions = [...previous.questions];

      questions[questionIndex] = {
        ...questions[questionIndex],
        questionText: value,
      };

      return {
        ...previous,
        questions,
      };
    });
  };

  // -------------------------
  // OPTION TEXT
  // -------------------------

  const handleOptionChange = (questionIndex, optionIndex, value) => {
    setFormData((previous) => {
      const questions = [...previous.questions];

      const options = [...questions[questionIndex].options];

      options[optionIndex] = value;

      questions[questionIndex] = {
        ...questions[questionIndex],
        options,
      };

      return {
        ...previous,
        questions,
      };
    });
  };

  // -------------------------
  // CORRECT ANSWER
  // -------------------------

  const handleCorrectOptionChange = (questionIndex, optionIndex) => {
    setFormData((previous) => {
      const questions = [...previous.questions];

      questions[questionIndex] = {
        ...questions[questionIndex],
        correctOption: optionIndex,
      };

      return {
        ...previous,
        questions,
      };
    });
  };

  // -------------------------
  // MARKS / TIMER
  // -------------------------

  const handleQuestionFieldChange = (questionIndex, field, value) => {
    setFormData((previous) => {
      const questions = [...previous.questions];

      questions[questionIndex] = {
        ...questions[questionIndex],
        [field]: value,
      };

      return {
        ...previous,
        questions,
      };
    });
  };

  // -------------------------
  // ADD QUESTION
  // -------------------------

  const addQuestion = () => {
    setFormData((previous) => ({
      ...previous,

      questions: [
        ...previous.questions,

        {
          questionText: "",
          options: ["", "", "", ""],
          correctOption: 0,
          marks: 1,
          timeLimit: 30,
        },
      ],
    }));
  };

  // -------------------------
  // REMOVE QUESTION
  // -------------------------

  const removeQuestion = (questionIndex) => {
    if (formData.questions.length === 1) {
      return;
    }

    setFormData((previous) => ({
      ...previous,

      questions: previous.questions.filter(
        (_, index) => index !== questionIndex,
      ),
    }));
  };

  // -------------------------
  // SAVE
  // -------------------------

  const handleSubmit = async (event) => {
    event.preventDefault();

    const action = event.nativeEvent.submitter?.value || "save";

    const status = action === "publish" ? "published" : formData.status;

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        ...formData,

        status,

        totalTimeLimit:
          formData.timerMode === "whole-quiz"
            ? Number(formData.totalTimeLimit)
            : null,
      };

      const response = await fetch(`${API_URL}/api/quizzes/${id}`, {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not update quiz.");
        return;
      }

      setMessage("Quiz updated successfully!");

      setTimeout(() => {
        navigate("/quizzes");
      }, 700);
    } catch (error) {
      console.error("Update quiz error:", error);

      setMessage("Could not update quiz. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // -------------------------
  // LOADING / ERROR
  // -------------------------

  if (loading) {
    return (
      <main>
        <div className="state-box">
          <h2>Loading quiz...</h2>

          <p>Getting the latest version of your quiz.</p>
        </div>
      </main>
    );
  }

  if (!formData) {
    return (
      <main>
        <div className="state-box error-state">
          <h2>Could not open quiz</h2>

          <p>{message || "Quiz could not be loaded."}</p>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/quizzes")}
          >
            Back to My Quizzes
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="quiz-builder">
      <div className="page-heading">
        <h1>Edit Quiz</h1>

        <p>Update questions, settings and publishing options.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* BASIC DETAILS */}

        <section className="form-card">
          <div className="section-heading">
            <h2>Basic Details</h2>

            <p>Update the main information for this quiz.</p>
          </div>

          <div className="form-grid">
            <div className="form-group form-group-full">
              <label htmlFor="title">Quiz title</label>

              <input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleBasicChange}
                required
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="description">Description</label>

              <textarea
                id="description"
                name="description"
                rows="4"
                value={formData.description}
                onChange={handleBasicChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>

              <input
                id="category"
                name="category"
                value={formData.category}
                onChange={handleBasicChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="difficulty">Difficulty</label>

              <select
                id="difficulty"
                name="difficulty"
                value={formData.difficulty}
                onChange={handleBasicChange}
              >
                <option value="easy">Easy</option>

                <option value="medium">Medium</option>

                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        </section>

        {/* SETTINGS */}

        <section className="form-card">
          <div className="section-heading">
            <h2>Quiz Settings</h2>

            <p>Adjust visibility and timer behaviour.</p>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="timerMode">Timer mode</label>

              <select
                id="timerMode"
                name="timerMode"
                value={formData.timerMode}
                onChange={handleBasicChange}
              >
                <option value="per-question">Per Question</option>

                <option value="whole-quiz">Whole Quiz</option>

                <option value="none">No Timer</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="visibility">Visibility</label>

              <select
                id="visibility"
                name="visibility"
                value={formData.visibility}
                onChange={handleBasicChange}
              >
                <option value="private">Private</option>

                <option value="unlisted">Unlisted</option>

                <option value="public">Public</option>
              </select>
            </div>

            {formData.timerMode === "whole-quiz" && (
              <div className="form-group">
                <label htmlFor="totalTimeLimit">Total time (seconds)</label>

                <input
                  id="totalTimeLimit"
                  type="number"
                  name="totalTimeLimit"
                  min="1"
                  value={formData.totalTimeLimit}
                  onChange={handleBasicChange}
                  required
                />
              </div>
            )}
          </div>
        </section>

        {/* QUESTIONS */}

        <div className="questions-heading">
          <div>
            <h2>Questions</h2>

            <p>Edit questions and select each correct answer.</p>
          </div>

          <span className="question-count">
            {formData.questions.length}{" "}
            {formData.questions.length === 1 ? "question" : "questions"}
          </span>
        </div>

        <div className="questions-list">
          {formData.questions.map((question, questionIndex) => (
            <section className="question-card" key={questionIndex}>
              <div className="question-card-header">
                <span className="question-number">
                  Question {questionIndex + 1}
                </span>

                <button
                  type="button"
                  className="btn btn-danger-soft"
                  disabled={formData.questions.length === 1}
                  onClick={() => removeQuestion(questionIndex)}
                >
                  Remove
                </button>
              </div>

              <div className="form-group">
                <label>Question text</label>

                <input
                  value={question.questionText}
                  onChange={(event) =>
                    handleQuestionTextChange(questionIndex, event.target.value)
                  }
                  required
                />
              </div>

              <div className="options-list">
                <label>Answer options</label>

                {question.options.map((option, optionIndex) => (
                  <div className="option-row" key={optionIndex}>
                    <input
                      className="correct-radio"
                      type="radio"
                      name={`correct-${questionIndex}`}
                      checked={question.correctOption === optionIndex}
                      onChange={() =>
                        handleCorrectOptionChange(questionIndex, optionIndex)
                      }
                    />

                    <span className="option-letter">
                      {String.fromCharCode(65 + optionIndex)}
                    </span>

                    <input
                      type="text"
                      value={option}
                      onChange={(event) =>
                        handleOptionChange(
                          questionIndex,
                          optionIndex,
                          event.target.value,
                        )
                      }
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="question-settings">
                <div className="form-group">
                  <label>Marks</label>

                  <input
                    type="number"
                    min="1"
                    value={question.marks}
                    onChange={(event) =>
                      handleQuestionFieldChange(
                        questionIndex,
                        "marks",
                        Number(event.target.value),
                      )
                    }
                  />
                </div>

                {formData.timerMode === "per-question" && (
                  <div className="form-group">
                    <label>Time limit (seconds)</label>

                    <input
                      type="number"
                      min="5"
                      value={question.timeLimit}
                      onChange={(event) =>
                        handleQuestionFieldChange(
                          questionIndex,
                          "timeLimit",
                          Number(event.target.value),
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        <button
          type="button"
          className="add-question-button"
          onClick={addQuestion}
        >
          + Add another question
        </button>

        {message && <div className="form-message">{message}</div>}

        <div className="quiz-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/quizzes")}
          >
            Cancel
          </button>

          <div className="quiz-action-buttons">
            <button
              type="submit"
              value="save"
              className="btn btn-secondary btn-large"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="submit"
              value="publish"
              className="btn btn-primary btn-large"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save & Publish"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

export default EditQuiz;
