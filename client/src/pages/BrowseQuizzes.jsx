import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link } from "react-router-dom";

import { API_URL } from "../config/api.js";

function BrowseQuizzes() {
  const [quizzes, setQuizzes] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [difficulty, setDifficulty] =
    useState("all");

  useEffect(() => {
    const loadQuizzes = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/quizzes/public`
        );

        const data = await response.json();

        if (!response.ok) {
          setError(
            data.message ||
              "Could not load quizzes."
          );

          return;
        }

        setQuizzes(data.quizzes);
      } catch (error) {
        console.error(error);

        setError(
          "Could not connect to the server."
        );
      } finally {
        setLoading(false);
      }
    };

    loadQuizzes();
  }, []);

  const filteredQuizzes =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return quizzes.filter((quiz) => {
        const matchesSearch =
          !query ||
          quiz.title
            .toLowerCase()
            .includes(query) ||
          quiz.category
            .toLowerCase()
            .includes(query);

        const matchesDifficulty =
          difficulty === "all" ||
          quiz.difficulty === difficulty;

        return (
          matchesSearch &&
          matchesDifficulty
        );
      });
    }, [
      quizzes,
      search,
      difficulty,
    ]);

  if (loading) {
    return (
      <main>
        <div className="state-box">
          <h2>Loading quizzes...</h2>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-toolbar">
        <div>
          <h1>Browse Quizzes</h1>

          <p>
            Discover public quizzes created
            on QuizVerse.
          </p>
        </div>
      </div>

      <div className="browse-controls">
        <input
          type="search"
          placeholder="Search quizzes or categories..."
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
        />

        <select
          value={difficulty}
          onChange={(event) =>
            setDifficulty(
              event.target.value
            )
          }
        >
          <option value="all">
            All difficulties
          </option>

          <option value="easy">
            Easy
          </option>

          <option value="medium">
            Medium
          </option>

          <option value="hard">
            Hard
          </option>
        </select>
      </div>

      {error && (
        <div className="state-box error-state">
          <h2>
            Could not load quizzes
          </h2>

          <p>{error}</p>
        </div>
      )}

      {!error &&
        filteredQuizzes.length ===
          0 && (
          <div className="state-box">
            <h2>
              No quizzes found
            </h2>

            <p>
              Try changing your search or
              difficulty filter.
            </p>
          </div>
        )}

      {!error &&
        filteredQuizzes.length >
          0 && (
          <div className="browse-grid">
            {filteredQuizzes.map(
              (quiz) => (
                <article
                  className="browse-card"
                  key={quiz._id}
                >
                  <div className="quiz-badges">
                    <span className="meta-badge">
                      {quiz.difficulty}
                    </span>

                    <span className="meta-badge">
                      {quiz.category}
                    </span>
                  </div>

                  <h2>
                    {quiz.title}
                  </h2>

                  <p>
                    {quiz.description ||
                      "No description provided."}
                  </p>

                  <div className="browse-meta">
                    <span>
                      {
                        quiz.questionCount
                      }{" "}
                      questions
                    </span>

                    <span>
                      By{" "}
                      {quiz.creator?.name ||
                        "QuizVerse creator"}
                    </span>
                  </div>

                  <Link
                    to={`/play/${quiz._id}`}
                    className="btn btn-primary"
                  >
                    Play Quiz
                  </Link>
                </article>
              )
            )}
          </div>
        )}
    </main>
  );
}

export default BrowseQuizzes;