import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import QuestionInput from "../components/QuestionInput.jsx";
import { hasAnswer } from "../config/questions.js";
import { API_URL } from "../config/api.js";
import { assignmentApi } from "../config/assignments.js";
function QuizPlayer() {
  const { token } = useParams();
  return token ? <AssignedPlayer key={token} token={token} /> : <StandalonePlayer />;
}
function StandalonePlayer() {
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

      const activeQuiz = data.quiz || quiz;
      setQuiz(activeQuiz);
      setAttemptId(data.attempt._id);

      attemptIdRef.current = data.attempt._id;

      setAnswers({});
      answersRef.current = {};

      setCurrentQuestionIndex(0);
      setTimeLeft(activeQuiz.timerMode === "whole-quiz" ? Number(activeQuiz.totalTimeLimit) : activeQuiz.timerMode === "per-question" ? Number(activeQuiz.questions[0]?.timeLimit) || 30 : null);

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

  const selectAnswer = (questionId, answer) => {
    setAnswers((previous) => {
      const updated = {
        ...previous,
        [questionId]: answer,
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

    const answeredCount = Object.values(answersRef.current).filter(hasAnswer).length;

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

        ...(answersRef.current[question._id] || {}),
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

    // Timer initialization synchronizes an external clock with the current question.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

    // Timer initialization synchronizes an external clock with the current question.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const selectedAnswer = answers[currentQuestion._id] || {};

  const answeredCount = Object.values(answers).filter(hasAnswer).length;

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

          <QuestionInput question={currentQuestion} answer={selectedAnswer} disabled={submitting} onChange={answer => selectAnswer(currentQuestion._id, answer)} />
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

function AssignedPlayer({ token }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null), [session, setSession] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saveNotice, setSaveNotice] = useState("");
  const draftsRef = useRef({});
  const [index, setIndex] = useState(0), [clock, setClock] = useState(() => Date.now());
  const currentSession = useRef(null), inFlight = useRef(false), clockOffset = useRef(0), autoSubmitted = useRef(false);
  const receive = useCallback(value => {
    currentSession.current = value;
    clockOffset.current = new Date(value.serverNow).getTime() - Date.now();
    setSession(value);
    if (value.quiz.timerMode === "per-question") {
      const expired = Object.keys(draftsRef.current).filter(key => Number(key) < value.currentQuestionIndex);
      if (expired.length) {
        const next = { ...draftsRef.current }; expired.forEach(key => delete next[key]);
        draftsRef.current = next; setDrafts(next);
        setSaveNotice("A question window ended before your unsaved changes were saved. Only server-saved answers will be graded.");
      }
      setIndex(value.currentQuestionIndex);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    assignmentApi(`assignments/${token}`, { signal: controller.signal }).then(setDetails)
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [token]);
  const operation = useCallback(async (action, body) => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const active = currentSession.current;
      const data = action === "start" ? await assignmentApi(`assignments/${token}/start`, { method: "POST" })
        : action === "refresh" ? await assignmentApi(`assignment-attempts/${active.publicId}`)
        : await assignmentApi(`assignment-attempts/${active.publicId}/${action}`, {
          method: action === "answer" ? "PUT" : "POST", body: JSON.stringify(body || {}) });
      if (data.result) navigate(`/assignment-attempts/${data.result.publicId}/result`, { replace: true });
      else receive(data.session);
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }, [token, navigate, receive]);
  const saveDrafts = useCallback(async () => {
    for (const [key, answer] of Object.entries(draftsRef.current)) {
      if (!await operation("answer", { key, ...answer })) return false;
      if (draftsRef.current[key] === answer) {
        const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next);
      }
    }
    return true;
  }, [operation]);
  function updateAnswer(answer, question) {
    const next = { ...draftsRef.current, [String(index)]: answer };
    draftsRef.current = next; setDrafts(next);
    // Retain the existing immediate persistence of choice answers.
    if (["singleChoice", "multipleSelect", "trueFalse"].includes(question.questionType || "singleChoice") && !inFlight.current) saveDrafts();
  }
  async function saveThen(action, body) {
    if (inFlight.current) return;
    const active = currentSession.current, now = Date.now() + clockOffset.current;
    const expired = (active.expiresAt && now >= new Date(active.expiresAt).getTime()) ||
      (active.questionClosesAt && now >= new Date(active.questionClosesAt).getTime());
    // Once a window ends, submission can only grade previously saved responses.
    if (!(action === "submit" && expired) && !await saveDrafts()) return;
    if (action) await operation(action, body);
  }
  async function navigateQuestion(nextIndex) {
    if (!inFlight.current && await saveDrafts()) setIndex(nextIndex);
  }
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const now = Date.now() + clockOffset.current;
      setClock(now);
      const active = currentSession.current;
      const finished = active.quiz.timerMode === "per-question" && active.currentQuestionIndex >= active.quiz.questions.length;
      if (finished || (active.expiresAt && now >= new Date(active.expiresAt).getTime()) ||
        (active.dueAt && now >= new Date(active.dueAt).getTime() - 1500)) {
        // Saved answers are graded by the server. No answer key or client score is sent.
        if (!inFlight.current && !autoSubmitted.current) { autoSubmitted.current = true;
          const expired = finished || (active.expiresAt && now >= new Date(active.expiresAt).getTime());
          (expired ? Promise.resolve(true) : saveDrafts()).then(saved => { if (saved) operation("submit"); else autoSubmitted.current = false; }); }
      } else if (active.questionClosesAt && now >= new Date(active.questionClosesAt).getTime()) {
        if (!inFlight.current) operation("refresh");
      }
    }, 500);
    return () => clearInterval(interval);
  }, [session, operation, saveDrafts]);
  if (!session) return <main className="player-shell"><section className="panel"><span className="eyebrow">CLASSROOM CHALLENGE</span><h1>{details?.assignment.title || "Assignment quiz"}</h1>{error && <p className="feedback feedback-error" role="alert">{error}</p>}{!details && !error && <p role="status">Loading assignment…</p>}{details && <><p>{details.assignment.group.name} · {details.assignment.state}</p><p>Save your answers before moving on. Timers and assignment eligibility are enforced by the server. Refreshing resumes this attempt.</p><button className="btn btn-primary" disabled={busy || details.canManage || details.assignment.state !== "open"} onClick={() => operation("start")}>{busy ? "Starting…" : "Start or resume attempt"}</button>{details.canManage && <p>Teachers can view analytics; only assigned students can attempt.</p>}</>}<Link className="btn btn-secondary" to={`/a/${token}`}>Back to assignment</Link></section></main>;
  const quiz = session.quiz, question = quiz.questions[index];
  const selected = drafts[String(index)] || session.answers.find(a => a.key === String(index)) || {};
  const deadlines = [session.expiresAt, session.dueAt, session.questionClosesAt].filter(Boolean).map(d => new Date(d).getTime());
  const seconds = deadlines.length ? Math.max(0, Math.ceil((Math.min(...deadlines) - clock) / 1000)) : null;
  return <main className="player-shell"><section className="player-card"><div className="page-toolbar"><div><span className="eyebrow">ASSIGNMENT · ATTEMPT {session.attemptNumber}</span><h1>{quiz.title}</h1></div>{seconds !== null && <span className="pill" aria-live="off">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} remaining</span>}</div>
    {saveNotice && <p className="feedback" role="status">{saveNotice}</p>}
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}
    {question ? <><p className="muted">Question {index + 1} of {quiz.questions.length} · {question.marks} marks</p><h2>{question.questionText}</h2><QuestionInput question={question} answer={selected} disabled={busy} onChange={answer => updateAnswer(answer, question)} />
      <button className="btn btn-secondary" disabled={busy || !Object.keys(drafts).length} onClick={() => saveThen()}>Save answer</button>
      <div className="assignment-actions">{quiz.timerMode !== "per-question" && <><button className="btn btn-secondary" disabled={busy || index === 0} onClick={() => navigateQuestion(index - 1)}>Previous</button><button className="btn btn-secondary" disabled={busy || index === quiz.questions.length - 1} onClick={() => navigateQuestion(index + 1)}>Next</button></>}{quiz.timerMode === "per-question" && index < quiz.questions.length - 1 && <button className="btn btn-secondary" disabled={busy} onClick={() => saveThen("advance", { key: String(index) })}>Save & next question</button>}<button className="btn btn-primary" disabled={busy} onClick={() => saveThen("submit")}>{busy ? "Saving…" : "Submit saved answers"}</button></div>
      <p className="muted" role="status">{busy ? "Saving your progress…" : Object.keys(drafts).length ? "You have unsaved changes. Save before leaving or the timer ends." : "Your answers are saved on the server."}</p></> : <><p>Question time has ended.</p><button className="btn btn-primary" disabled={busy} onClick={() => saveThen("submit")}>Submit saved answers</button></>}
  </section></main>;
}

export default QuizPlayer;
