import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SubmitDeletion from "./pages/SubmitDeletion";
import BulkUpload from "./pages/BulkUpload";
import Users from "./pages/Users";
import History from "./pages/History";
import Admin from "./pages/Admin";
import DataDiscovery from "./pages/DataDiscovery";
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
            <Route path="/bulk" element={<BulkUpload />} />
            <Route path="/users" element={<Users />} />
            <Route path="/history" element={<History />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/discover" element={<DataDiscovery />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
