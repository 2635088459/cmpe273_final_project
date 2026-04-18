import { useState } from "react";

function SubmitDeletion() {
  const [subjectId, setSubjectId] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (!subjectId) {
      setMessage("Subject ID is required");
      return;
    }

    // Temporary mock response
    setMessage("Request Created Successfully (ID: 12345)");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto" }}>
      <h1>Submit Deletion Request</h1>
      <input
        placeholder="Enter Subject ID"
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        style={{ padding: "8px", width: "100%", marginBottom: "10px" }}
      />
      <br />
      <br />
      <button onClick={handleSubmit} style={{ padding: "8px 16px", cursor: "pointer" }}>
        Submit
      </button>
      {message && (
        <p style={{ marginTop: "10px", color: message.includes("Error") ? "red" : "green" }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default SubmitDeletion;
