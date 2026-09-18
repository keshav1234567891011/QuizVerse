import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { API_URL } from "../config/api.js";
function QuizPlayer() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [quiz, setQuiz] = useState(null);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [started, setStarted] = useState(false);
  const [attemptId, setAttemptId] = useState(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [answers, setAnswers] = useState({});

  const [timeLeft, setTimeLeft] = useState(null);

  const [result, setResult] = useState(null);

  /*
    Refs let the timer always access the latest
    answers and attempt ID without resetting itself.
  */

  const answersRef = useRef({});
  const attemptIdRef = useRef(null);
  const submitQuizRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // =========================
  // LOAD PLAYABLE QUIZ
  // =========================

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/api/quizzes/play/${id}`);

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Could not load this quiz.");

          return;
        }

        setQuiz(data.quiz);
      } catch (error) {
        console.error("Load quiz error:", error);

        setError("Could not connect to the QuizVerse server.");
      } finally {
        setLoading(false);
      }
    };

    loadQuiz();
  }, [id]);

  // =========================
  // START ATTEMPT
  // =========================

  const startQuiz = async () => {
    try {
      setStarting(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/attempts/start/${quiz._id}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not start the quiz attempt.");

        return;
      }

      setAttemptId(data.attempt._id);

      attemptIdRef.current = data.attempt._id;

      setAnswers({});
      answersRef.current = {};

      setCurrentQuestionIndex(0);

      setResult(null);

      setStarted(true);
    } catch (error) {
      console.error("Start quiz error:", error);

      setError("Could not start the quiz. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  // =========================
  // SELECT ANSWER
  // =========================

  const selectAnswer = (questionId, optionIndex) => {
    setAnswers((previous) => {
      const updated = {
        ...previous,
        [questionId]: optionIndex,
      };

      answersRef.current = updated;

      return updated;
    });
  };

  // =========================
  // SUBMIT ATTEMPT
  // =========================

  const submitQuiz = async ({ skipConfirmation = false } = {}) => {
    if (submittingRef.current || !attemptIdRef.current || !quiz) {
      return;
    }

    const answeredCount = Object.keys(answersRef.current).length;

    if (!skipConfirmation) {
      const unanswered = quiz.questions.length - answeredCount;

      const message =
        unanswered > 0
          ? `You still have ${unanswered} unanswered question(s). Submit anyway?`
          : "Submit your quiz now?";

      const confirmed = window.confirm(message);

      if (!confirmed) {
        return;
      }
    }

    try {
      submittingRef.current = true;

      setSubmitting(true);
      setError("");

      /*
        We send EVERY question.

        If the player didn't answer one,
        selectedOption becomes null.
      */

      const formattedAnswers = quiz.questions.map((question) => ({
        questionId: question._id,

        selectedOption: answersRef.current[question._id] ?? null,
      }));

      const response = await fetch(
        `${API_URL}/api/attempts/${attemptIdRef.current}/submit`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            answers: formattedAnswers,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not submit the quiz.");

        return;
      }

      navigate(`/attempts/${data.result.attemptId}/result`);
    } catch (error) {
      console.error("Submit quiz error:", error);

      setError("Could not submit the quiz. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  /*
    Keep a reference to the newest submitQuiz
    function so timers can safely call it.
  */

  useEffect(() => {
    submitQuizRef.current = submitQuiz;
  });

  // =========================
  // WHOLE QUIZ TIMER
  // =========================

  useEffect(() => {
    if (!started || !quiz || quiz.timerMode !== "whole-quiz") {
      return;
    }

    const startingTime = Number(quiz.totalTimeLimit);

    setTimeLeft(startingTime);

    const interval = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous === null) {
          return previous;
        }

        if (previous <= 1) {
          clearInterval(interval);

          setTimeout(() => {
            submitQuizRef.current?.({
              skipConfirmation: true,
            });
          }, 0);

          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [started, quiz]);

  // =========================
  // PER QUESTION TIMER
  // =========================

  useEffect(() => {
    if (!started || !quiz || quiz.timerMode !== "per-question") {
      return;
    }

    const question = quiz.questions[currentQuestionIndex];

    const startingTime = Number(question?.timeLimit) || 30;

    setTimeLeft(startingTime);

    const interval = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous === null) {
          return previous;
        }

        if (previous <= 1) {
          clearInterval(interval);

          setTimeout(() => {
            const isLastQuestion =
              currentQuestionIndex === quiz.questions.length - 1;

            if (isLastQuestion) {
              submitQuizRef.current?.({
                skipConfirmation: true,
              });
            } else {
              setCurrentQuestionIndex((index) => index + 1);
            }
          }, 0);

          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [started, quiz, currentQuestionIndex]);

  // =========================
  // NO TIMER
  // =========================

  useEffect(() => {
    if (started && quiz?.timerMode === "none") {
      setTimeLeft(null);
    }
  }, [started, quiz]);

  // =========================
  // NAVIGATION
  // =========================

  const previousQuestion = () => {
    setCurrentQuestionIndex((index) => Math.max(0, index - 1));
  };

  const nextQuestion = () => {
    setCurrentQuestionIndex((index) =>
      Math.min(quiz.questions.length - 1, index + 1),
    );
  };

  // =========================
  // PLAY AGAIN
  // =========================

  const playAgain = () => {
    setResult(null);
    setStarted(false);

    setAttemptId(null);
    attemptIdRef.current = null;

    setAnswers({});
    answersRef.current = {};

    setCurrentQuestionIndex(0);

    setTimeLeft(null);
    setError("");
  };

  // =========================
  // TIME FORMAT
  // =========================

  const formatTime = (seconds) => {
    if (seconds === null) {
      return "";
    }

    const minutes = Math.floor(seconds / 60);

    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  };

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <main className="player-shell">
        <div className="state-box">
          <h2>Loading quiz...</h2>

          <p>Preparing your QuizVerse challenge.</p>
        </div>
      </main>
    );
  }

  // =========================
  // LOAD ERROR
  // =========================

  if (!quiz) {
    return (
      <main className="player-shell">
        <div className="state-box error-state">
          <h2>Quiz unavailable</h2>

          <p>{error || "This quiz could not be loaded."}</p>

          <Link to="/dashboard" className="btn btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  // =========================
  // RESULTS SCREEN
  // =========================

  if (result) {
    return (
      <main className="player-shell">
        <section className="result-card">
          <span className="result-eyebrow">Quiz completed</span>

          <div className="result-score-circle">
            <strong>{Math.round(result.percentage)}%</strong>

            <span>Your score</span>
          </div>

          <h1>{quiz.title}</h1>

          <p className="result-message">
            Your attempt has been submitted and scored securely by the QuizVerse
            server.
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
            <button className="btn btn-primary btn-large" onClick={playAgain}>
              Play Again
            </button>

            <Link to="/dashboard" className="btn btn-secondary btn-large">
              Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // =========================
  // START SCREEN
  // =========================

  if (!started) {
    return (
      <main className="player-shell">
        <section className="quiz-intro-card">
          <span className="player-eyebrow">Ready to play?</span>

          <h1>{quiz.title}</h1>

          <p className="quiz-intro-description">
            {quiz.description || "Test your knowledge with this quiz."}
          </p>

          <div className="quiz-intro-meta">
            <div>
              <span>Questions</span>

              <strong>{quiz.questionCount}</strong>
            </div>

            <div>
              <span>Difficulty</span>

              <strong>{quiz.difficulty}</strong>
            </div>

            <div>
              <span>Category</span>

              <strong>{quiz.category}</strong>
            </div>

            <div>
              <span>Timer</span>

              <strong>
                {quiz.timerMode === "per-question"
                  ? "Per question"
                  : quiz.timerMode === "whole-quiz"
                    ? "Whole quiz"
                    : "None"}
              </strong>
            </div>
          </div>

          <div className="quiz-rules">
            <h2>Before you start</h2>

            <p>
              Your attempt begins when you press Start Quiz. Your score is
              calculated by the server after submission.
            </p>

            {quiz.timerMode === "per-question" && (
              <p>
                Each question has its own timer. When time expires, QuizVerse
                automatically moves to the next question.
              </p>
            )}

            {quiz.timerMode === "whole-quiz" && (
              <p>
                The entire quiz has a single timer. The attempt is automatically
                submitted when time runs out.
              </p>
            )}
          </div>

          {error && <div className="form-message">{error}</div>}

          <button
            className="btn btn-primary start-quiz-button"
            onClick={startQuiz}
            disabled={starting}
          >
            {starting ? "Starting..." : "Start Quiz"}
          </button>
        </section>
      </main>
    );
  }

  // =========================
  // ACTIVE QUIZ
  // =========================

  const currentQuestion = quiz.questions[currentQuestionIndex];

  const selectedOption = answers[currentQuestion._id];

  const answeredCount = Object.keys(answers).length;

  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;

  return (
    <main className="player-shell">
      <section className="player-card">
        {/* TOP BAR */}

        <div className="player-topbar">
          <div>
            <span className="player-quiz-title">{quiz.title}</span>

            <span className="player-question-position">
              Question {currentQuestionIndex + 1} of {quiz.questions.length}
            </span>
          </div>

          {timeLeft !== null && (
            <div
              className={`quiz-timer ${
                timeLeft <= 10 ? "quiz-timer-warning" : ""
              }`}
            >
              {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* PROGRESS */}

        <div className="player-progress-track">
          <div
            className="player-progress-value"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        {/* QUESTION */}

        <div className="player-question-content">
          <div className="player-question-meta">
            <span>Question {currentQuestionIndex + 1}</span>

            <span>
              {currentQuestion.marks}{" "}
              {currentQuestion.marks === 1 ? "mark" : "marks"}
            </span>
          </div>

          <h1>{currentQuestion.questionText}</h1>

          {/* OPTIONS */}

          <div className="player-options">
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected = selectedOption === optionIndex;

              return (
                <button
                  type="button"
                  className={`player-option ${
                    isSelected ? "player-option-selected" : ""
                  }`}
                  key={optionIndex}
                  onClick={() => selectAnswer(currentQuestion._id, optionIndex)}
                  aria-pressed={isSelected}
                >
                  <span className="player-option-letter">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>

                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}

        <div className="player-footer">
          <div className="player-answer-count">
            {answeredCount} / {quiz.questions.length} answered
          </div>

          <div className="player-navigation">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={previousQuestion}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </button>

            {!isLastQuestion ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={nextQuestion}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => submitQuiz()}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Quiz"}
              </button>
            )}
          </div>
        </div>

        {error && <div className="player-error">{error}</div>}
      </section>
    </main>
  );
}

export default QuizPlayer;
