import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config/api.js";

function MyAttempts() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadAttempts = async () => {
      try {
        const response = await fetch(`${API_URL}/api/attempts/mine`, {
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Could not load attempts.");
          return;
        }

        setAttempts(data.attempts);
      } catch (error) {
        console.error("Load attempts error:", error);

        setError("Could not connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    loadAttempts();
  }, []);

  if (loading) {
    return (
      <main>
        <div className="state-box">
          <h2>Loading your attempts...</h2>

          <p>Retrieving your previous quiz results.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-toolbar">
        <div>
          <h1>My Attempts</h1>

          <p>Review your previous quiz results.</p>
        </div>

        <Link to="/browse" className="btn btn-primary">
          Browse Quizzes
        </Link>
      </div>

      {error && (
        <div className="state-box error-state">
          <h2>Could not load attempts</h2>
          <p>{error}</p>
        </div>
      )}

      {!error && attempts.length === 0 && (
        <div className="state-box">
          <div className="empty-icon">A</div>

          <h2>No attempts yet</h2>

          <p>Play a quiz and your result will appear here.</p>

          <Link to="/browse" className="btn btn-primary">
            Find a Quiz
          </Link>
        </div>
      )}

      {!error && attempts.length > 0 && (
        <div className="attempt-list">
          {attempts.map((attempt) => (
            <article className="attempt-card" key={attempt._id}>
              <div>
                <span className="attempt-category">
                  {attempt.quiz?.category || "Quiz"}
                </span>

                <h2>{attempt.quiz?.title || "Deleted Quiz"}</h2>

                <p>{new Date(attempt.submittedAt).toLocaleString()}</p>
              </div>

              <div className="attempt-score">
                <strong>{Math.round(attempt.percentage)}%</strong>

                <span>
                  {attempt.score} / {attempt.totalMarks}
                </span>
              </div>

              <Link
                to={`/attempts/${attempt._id}/result`}
                className="btn btn-secondary"
              >
                View Result
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export default MyAttempts;
