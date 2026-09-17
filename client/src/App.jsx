import { useEffect, useState } from "react";

function App() {
  const [message, setMessage] = useState("Connecting to backend...");

  useEffect(() => {
    fetch("http://localhost:5000/api/health")
      .then((response) => response.json())
      .then((data) => {
        setMessage(data.message);
      })
      .catch((error) => {
        console.error("Backend connection failed:", error);
        setMessage("Could not connect to backend");
      });
  }, []);

  return (
    <div>
      <h1>QuizVerse</h1>

      <p>Frontend is running ✅</p>

      <p>Backend says: {message}</p>
    </div>
  );
}

export default App;
