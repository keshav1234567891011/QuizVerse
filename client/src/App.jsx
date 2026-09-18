import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Dashboard from "./pages/Dashboard.jsx";
function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<h1>QuizVerse Home</h1>} />

        <Route path="/register" element={<Register />} />

        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quizzes/create"
          element={
            <ProtectedRoute>
              <CreateQuiz />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
