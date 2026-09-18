import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          QuizVerse
        </Link>

        <nav className="navbar-links">
          <Link to="/">Home</Link>

          <Link to="/browse">Browse</Link>

          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>

              <Link to="/quizzes">My Quizzes</Link>

              <Link to="/attempts">My Attempts</Link>

              <Link to="/quizzes/create">Create Quiz</Link>

              <span className="navbar-user">Hi, {user.name}</span>

              <button className="btn btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>

              <Link to="/register" className="btn btn-primary">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
