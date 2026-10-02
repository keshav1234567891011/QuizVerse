import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config/api.js";
import { useAuth } from "../context/auth.js";

function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: searchParams.get("role") === "teacher" ? "teacher" : "student",
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/dashboard", {
        replace: true,
      });
    }
  }, [user, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Registration failed.");
        return;
      }

      setMessage("Account created successfully. Redirecting...");

      setTimeout(() => {
        navigate("/login");
      }, 900);
    } catch (error) {
      console.error(error);
      setMessage("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-header">
          <span className="auth-badge">Join QuizVerse</span>

          <h1>Create your account</h1>

          <p>
            Join as a student to learn and attempt quizzes, or as a teacher to
            create quizzes and manage classes.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>

            <input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              autoComplete="name"
              minLength={2}
              maxLength={50}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email address</label>

            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength="6"
              required
            />
          </div>

          <fieldset className="role-picker"><legend>How will you use QuizVerse?</legend><div className="role-cards">
            {[["student", "I'm a student", "Attempt quizzes", "Join classrooms", "Track progress"], ["teacher", "I'm a teacher", "Create quizzes", "Manage classrooms", "View student progress (coming soon)"]].map(([role,title,...features]) => <label key={role} className={`role-card ${formData.role === role ? "role-selected" : ""}`}><input type="radio" name="role" value={role} checked={formData.role === role} onChange={handleChange} disabled={loading} /><strong>{title}</strong><ul>{features.map(feature=><li key={feature}>{feature}</li>)}</ul></label>)}
          </div><p className="muted">Teacher classroom progress reports are coming later; students can view their own results today.</p></fieldset>

          {message && <div className="auth-message" role="status">{message}</div>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </section>
    </main>
  );
}

export default Register;
