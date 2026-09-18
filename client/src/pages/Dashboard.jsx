import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <main>
      <h1>QuizVerse Dashboard</h1>

      <p>
        Welcome, <strong>{user.name}</strong>
      </p>

      <p>{user.email}</p>

      <button onClick={handleLogout}>Logout</button>
    </main>
  );
}

export default Dashboard;
