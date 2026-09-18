import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MyQuizzes from "./pages/MyQuizzes.jsx";
import EditQuiz from "./pages/EditQuiz.jsx";
import QuizPlayer from "./pages/QuizPlayer.jsx";
import BrowseQuizzes from "./pages/BrowseQuizzes.jsx";
import MyAttempts from "./pages/MyAttempts.jsx";
import AttemptResult from "./pages/AttemptResult.jsx";
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
        <Route
          path="/quizzes"
          element={
            <ProtectedRoute>
              <MyQuizzes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quizzes/:id/edit"
          element={
            <ProtectedRoute>
              <EditQuiz />
            </ProtectedRoute>
          }
        />
        <Route
          path="/play/:id"
          element={
            <ProtectedRoute>
              <QuizPlayer />
            </ProtectedRoute>
          }
        />
        <Route path="/browse" element={<BrowseQuizzes />} />

        <Route
          path="/attempts"
          element={
            <ProtectedRoute>
              <MyAttempts />
            </ProtectedRoute>
          }
        />

        <Route
          path="/attempts/:attemptId/result"
          element={
            <ProtectedRoute>
              <AttemptResult />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
