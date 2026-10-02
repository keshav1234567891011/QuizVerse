import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../config/api.js";
import QuestionEditor from "../components/QuestionEditor.jsx";
import { newQuestion, questionError, questionPayload } from "../config/questions.js";

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

          questions: quiz.questions?.length ? quiz.questions.map(q => ({ ...q, questionType: q.questionType || "singleChoice", clientKey: String(q._id) })) : [newQuestion()],
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
  // SAVE QUIZ
  // -------------------------

  const handleSubmit = async (event) => {
    event.preventDefault();
    const invalid = formData.questions.findIndex(q => questionError(q));
    if (invalid >= 0) { setMessage(`Question ${invalid + 1}: ${questionError(formData.questions[invalid])}`); return; }

    const action = event.nativeEvent.submitter?.value || "save";

    const status = action === "publish" ? "published" : formData.status;

    setSaving(true);
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

        <QuestionEditor questions={formData.questions} timerMode={formData.timerMode} onChange={questions => setFormData(previous => ({ ...previous, questions }))} />

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
