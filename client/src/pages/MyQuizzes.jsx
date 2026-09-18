import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config/api.js";

function MyQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyQuizId, setBusyQuizId] = useState(null);

  const loadQuizzes = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/api/quizzes/mine`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not load quizzes.");
        return;
      }

      setQuizzes(data.quizzes);
    } catch (error) {
      console.error(error);
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const handleDelete = async (quiz) => {
    const confirmed = window.confirm(
      `Delete "${quiz.title}"? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyQuizId(quiz._id);

      const response = await fetch(`${API_URL}/api/quizzes/${quiz._id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Could not delete quiz.");
        return;
      }

      setQuizzes((previous) =>
        previous.filter((item) => item._id !== quiz._id),
      );
    } catch (error) {
      console.error(error);
      alert("Could not delete quiz.");
    } finally {
      setBusyQuizId(null);
    }
  };

  const togglePublishStatus = async (quiz) => {
    const nextStatus = quiz.status === "published" ? "draft" : "published";

    try {
      setBusyQuizId(quiz._id);

      const response = await fetch(`${API_URL}/api/quizzes/${quiz._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Could not update quiz status.");
        return;
      }

      setQuizzes((previous) =>
        previous.map((item) => (item._id === quiz._id ? data.quiz : item)),
      );
    } catch (error) {
      console.error(error);
      alert("Could not update quiz.");
    } finally {
      setBusyQuizId(null);
    }
  };

  if (loading) {
    return (
      <main>
        <div className="state-box">
          <h2>Loading your quizzes...</h2>
          <p>Fetching your latest QuizVerse content.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-toolbar">
        <div>
          <h1>My Quizzes</h1>

          <p>Manage drafts and published quizzes.</p>
        </div>

        <Link to="/quizzes/create" className="btn btn-primary btn-large">
          + Create Quiz
        </Link>
      </div>

      {error && (
        <div className="state-box error-state">
          <h2>Could not load quizzes</h2>
          <p>{error}</p>

          <button className="btn btn-primary" onClick={loadQuizzes}>
            Try Again
          </button>
        </div>
      )}

      {!error && quizzes.length === 0 && (
        <div className="state-box">
          <div className="empty-icon">Q</div>

          <h2>No quizzes yet</h2>

          <p>Create your first quiz and it will appear here.</p>

          <Link to="/quizzes/create" className="btn btn-primary">
            Create First Quiz
          </Link>
        </div>
      )}

      {!error && quizzes.length > 0 && (
        <div className="quiz-grid">
          {quizzes.map((quiz) => (
            <article className="quiz-management-card" key={quiz._id}>
              <div className="quiz-card-top">
                <div className="quiz-badges">
                  <span
                    className={`status-badge ${
                      quiz.status === "published"
                        ? "status-published"
                        : "status-draft"
                    }`}
                  >
                    {quiz.status}
                  </span>

                  <span className="meta-badge">{quiz.difficulty}</span>
                </div>

                <span className="visibility-text">{quiz.visibility}</span>
              </div>

              <div className="quiz-card-content">
                <h2>{quiz.title}</h2>

                <p>{quiz.description || "No description added."}</p>
              </div>

              <div className="quiz-card-meta">
                <span>{quiz.questions?.length || 0} questions</span>

                <span>{quiz.category}</span>

                <span>
                  Updated {new Date(quiz.updatedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="quiz-card-actions">
                <Link
                  to={`/quizzes/${quiz._id}/edit`}
                  className="btn btn-secondary"
                >
                  {quiz.status === "published" &&
                    quiz.visibility !== "private" && (
                      <Link
                        to={`/play/${quiz._id}`}
                        className="btn btn-primary"
                      >
                        Play
                      </Link>
                    )}
                  Edit
                </Link>
                <button
                  className="btn btn-secondary"
                  disabled={busyQuizId === quiz._id}
                  onClick={() => togglePublishStatus(quiz)}
                >
                  {quiz.status === "published" ? "Move to Draft" : "Publish"}
                </button>

                <button
                  className="btn btn-danger"
                  disabled={busyQuizId === quiz._id}
                  onClick={() => handleDelete(quiz)}
                >
                  {busyQuizId === quiz._id ? "Working..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export default MyQuizzes;
