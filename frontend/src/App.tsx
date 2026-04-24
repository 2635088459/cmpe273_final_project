import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SubmitDeletion from "./pages/SubmitDeletion";
import Users from "./pages/Users";
import Navbar from "./components/Navbar";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="app-frame">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/submit" element={<SubmitDeletion />} />
            <Route path="/users" element={<Users />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
