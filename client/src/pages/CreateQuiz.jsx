import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api.js";
import QuestionEditor from "../components/QuestionEditor.jsx";
import { newQuestion, questionError, questionPayload } from "../config/questions.js";

function CreateQuiz() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    difficulty: "medium",
    timerMode: "per-question",
    totalTimeLimit: "",
    visibility: "private",
    status: "draft",

    questions: [newQuestion()],
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // -------------------------
  // BASIC QUIZ FIELDS
  // -------------------------

  const handleBasicChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // -------------------------
  // SAVE QUIZ
  // -------------------------

  const handleSubmit = async (event) => {
    event.preventDefault();
    const invalid = formData.questions.findIndex(q => questionError(q));
    if (invalid >= 0) { setMessage(`Question ${invalid + 1}: ${questionError(formData.questions[invalid])}`); return; }

    /*
      The button that submitted the form tells us
      whether the user clicked:

      Save Draft
      or
      Publish Quiz
    */

    const status = event.nativeEvent.submitter?.value || "draft";

    setLoading(true);
    setMessage("");

    try {
      const payload = {
        ...formData,
        questions: formData.questions.map(questionPayload),

        status,

        totalTimeLimit:
          formData.timerMode === "whole-quiz"
            ? Number(formData.totalTimeLimit)
            : null,
      };

      const response = await fetch(`${API_URL}/api/quizzes`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not create quiz.");

        return;
      }

      setMessage(
        status === "published"
          ? "Quiz published successfully!"
          : "Quiz saved as draft!",
      );

      setTimeout(() => {
        navigate("/dashboard");
      }, 800);
    } catch (error) {
      console.error("Create quiz error:", error);

      setMessage("Could not create quiz. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="quiz-builder">
      {/* PAGE HEADING */}

      <div className="page-heading">
        <div>
          <h1>Create Quiz</h1>

          <p>
            Build your quiz, configure the settings, then save it as a draft or
            publish it.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* =========================
            BASIC DETAILS
        ========================== */}

        <section className="form-card">
          <div className="section-heading">
            <div>
              <h2>Basic Details</h2>

              <p>Give your quiz a clear title and category.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group form-group-full">
              <label htmlFor="title">Quiz title</label>

              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleBasicChange}
                placeholder="e.g. JavaScript Fundamentals"
                required
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="description">Description</label>

              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleBasicChange}
                placeholder="What is this quiz about?"
                rows="4"
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>

              <input
                id="category"
                name="category"
                type="text"
                value={formData.category}
                onChange={handleBasicChange}
                placeholder="Programming"
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

        {/* =========================
            QUIZ SETTINGS
        ========================== */}

        <section className="form-card">
          <div className="section-heading">
            <div>
              <h2>Quiz Settings</h2>

              <p>Configure timing and visibility.</p>
            </div>
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

        {/* =========================
            QUESTIONS HEADING
        ========================== */}

        <div className="questions-heading">
          <div>
            <h2>Questions</h2>

            <p>Select the radio button beside the correct answer.</p>
          </div>

          <span className="question-count">
            {formData.questions.length}{" "}
            {formData.questions.length === 1 ? "question" : "questions"}
          </span>
        </div>

        {/* =========================
            QUESTION CARDS
        ========================== */}

        <QuestionEditor questions={formData.questions} timerMode={formData.timerMode} onChange={questions => setFormData(previous => ({ ...previous, questions }))} />

        {/* MESSAGE */}

        {message && <div className="form-message">{message}</div>}

        {/* =========================
            ACTIONS
        ========================== */}

        <div className="quiz-actions">
          <span>You can publish immediately or continue editing later.</span>

          <div className="quiz-action-buttons">
            <button
              type="submit"
              value="draft"
              className="btn btn-secondary btn-large"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Draft"}
            </button>

            <button
              type="submit"
              value="published"
              className="btn btn-primary btn-large"
              disabled={loading}
            >
              {loading ? "Publishing..." : "Publish Quiz"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

export default CreateQuiz;
