import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { API_URL } from "../config/api.js";

function AttemptResult() {
  const { attemptId } = useParams();

  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    const loadResult = async () => {
      try {
        const response = await fetch(`${API_URL}/api/attempts/${attemptId}`, {
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Could not load result.");

          return;
        }

        setResult(data.result);
      } catch (error) {
        console.error("Load result error:", error);

        setError("Could not connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [attemptId]);

  const formatTime = (seconds) => {
    const total = Number(seconds) || 0;

    const minutes = Math.floor(total / 60);

    const remaining = total % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(
      2,
      "0",
    )}`;
  };

  if (loading) {
    return (
      <main className="player-shell">
        <div className="state-box">
          <h2>Loading result...</h2>

          <p>Retrieving your saved attempt.</p>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="player-shell">
        <div className="state-box error-state">
          <h2>Result unavailable</h2>

          <p>{error}</p>

          <Link to="/attempts" className="btn btn-secondary">
            My Attempts
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="player-shell">
      <section className="result-card">
        <span className="result-eyebrow">Attempt completed</span>

        <div className="result-score-circle">
          <strong>{Math.round(result.percentage)}%</strong>

          <span>Your score</span>
        </div>

        <h1>{result.quiz?.title || "Quiz Result"}</h1>

        <p className="result-message">
          Your score is permanently saved to your QuizVerse account.
        </p>

        <div className="result-stats">
          <div>
            <span>Score</span>

            <strong>
              {result.score} / {result.totalMarks}
            </strong>
          </div>

          <div>
            <span>Correct</span>

            <strong>
              {result.correctAnswers} / {result.totalQuestions}
            </strong>
          </div>

          <div>
            <span>Time</span>

            <strong>{formatTime(result.timeTakenSeconds)}</strong>
          </div>
        </div>

        <div className="result-actions">
          {result.quiz?._id && (
            <Link
              to={`/play/${result.quiz._id}`}
              className="btn btn-primary btn-large"
            >
              Play Again
            </Link>
          )}

          <Link to="/attempts" className="btn btn-secondary btn-large">
            My Attempts
          </Link>

          <Link to="/browse" className="btn btn-secondary btn-large">
            Browse Quizzes
          </Link>
        </div>
      </section>
    </main>
  );
}

export default AttemptResult;
