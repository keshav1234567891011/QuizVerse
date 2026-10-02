import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";
import MyQuizzes from "./pages/MyQuizzes.jsx";
import EditQuiz from "./pages/EditQuiz.jsx";
import QuizPlayer from "./pages/QuizPlayer.jsx";
import BrowseQuizzes from "./pages/BrowseQuizzes.jsx";
import MyAttempts from "./pages/MyAttempts.jsx";
import AttemptResult from "./pages/AttemptResult.jsx";
import Home from "./pages/Home.jsx";
import Groups from "./pages/Groups.jsx";
import Assignments from "./pages/Assignments.jsx";
import CreateAssignment from "./pages/CreateAssignment.jsx";
import AssignmentDetail from "./pages/AssignmentDetail.jsx";
import AssignmentResult from "./pages/AssignmentResult.jsx";

import { NotificationProvider } from "./context/NotificationContext.jsx";
import Notifications from "./pages/Notifications.jsx";
import GroupChat from "./pages/GroupChat.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminQuizzes from "./pages/AdminQuizzes.jsx";
import AdminGroups from "./pages/AdminGroups.jsx";
import AdminAssignments from "./pages/AdminAssignments.jsx";
import AdminAttempts from "./pages/AdminAttempts.jsx";

function App() {
  return (
    <BrowserRouter><NotificationProvider>
      <Navbar />

      <div id="main-content" tabIndex={-1}><Routes>
        <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="quizzes" element={<AdminQuizzes />} />
          <Route path="groups" element={<AdminGroups />} />
          <Route path="assignments" element={<AdminAssignments />} />
          <Route path="attempts" element={<AdminAttempts />} />
        </Route>
        <Route path="/" element={<Home />} />

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

        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/groups/:code/chat" element={<ProtectedRoute><GroupChat /></ProtectedRoute>} />
        <Route path="/browse" element={<BrowseQuizzes />} />
        <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
        <Route path="/assignments/create" element={<ProtectedRoute roles={["teacher", "admin"]}><CreateAssignment /></ProtectedRoute>} />
        <Route path="/a/:token" element={<ProtectedRoute><AssignmentDetail /></ProtectedRoute>} />
        <Route path="/a/:token/play" element={<ProtectedRoute><QuizPlayer /></ProtectedRoute>} />
        <Route path="/assignment-attempts/:publicId/result" element={<ProtectedRoute><AssignmentResult /></ProtectedRoute>} />

        <Route
          path="/play/:id"
          element={
            <ProtectedRoute>
              <QuizPlayer />
            </ProtectedRoute>
          }
        />

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

        <Route
          path="/groups"
          element={
            <ProtectedRoute>
              <Groups />
            </ProtectedRoute>
          }
        />

        <Route
          path="/quizzes/create"
          element={
            <ProtectedRoute roles={["teacher", "admin"]}>
              <CreateQuiz />
            </ProtectedRoute>
          }
        />

        <Route
          path="/quizzes"
          element={
            <ProtectedRoute roles={["teacher", "admin"]}>
              <MyQuizzes />
            </ProtectedRoute>
          }
        />

        <Route
          path="/quizzes/:id/edit"
          element={
            <ProtectedRoute roles={["teacher", "admin"]}>
              <EditQuiz />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<main><h1>Page not found</h1><p>Choose a destination from the navigation to keep exploring.</p></main>} />
      </Routes></div>
    </NotificationProvider></BrowserRouter>
  );
}

export default App;
