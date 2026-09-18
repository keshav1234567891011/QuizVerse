import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function Dashboard() {
  const { user } = useAuth();

  return (
    <main>
      <section className="dashboard-hero">
        <div>
          <span className="dashboard-eyebrow">Creator Dashboard</span>

          <h1>Welcome back, {user?.name}</h1>

          <p>
            Create quizzes, manage your existing content, and prepare them for
            players.
          </p>
        </div>

        <Link to="/quizzes/create" className="btn btn-primary btn-large">
          + Create Quiz
        </Link>
      </section>

      <section className="dashboard-grid">
        <Link to="/quizzes/create" className="dashboard-card">
          <span className="dashboard-card-icon">+</span>

          <h2>Create Quiz</h2>

          <p>
            Build a new quiz with questions, timers and difficulty settings.
          </p>

          <span className="dashboard-card-link">Start creating →</span>
        </Link>

        <Link to="/quizzes" className="dashboard-card">
          <span className="dashboard-card-icon">Q</span>

          <h2>My Quizzes</h2>

          <p>
            View drafts, published quizzes and manage your existing content.
          </p>

          <span className="dashboard-card-link">Manage quizzes →</span>
        </Link>
      </section>

      <section className="account-card">
        <div>
          <h2>Account</h2>

          <p>Your authenticated QuizVerse profile.</p>
        </div>

        <div className="account-details">
          <div>
            <span>Name</span>
            <strong>{user?.name}</strong>
          </div>

          <div>
            <span>Email</span>
            <strong>{user?.email}</strong>
          </div>

          <div>
            <span>Role</span>
            <strong>{user?.role}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
