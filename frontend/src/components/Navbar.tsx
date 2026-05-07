import { NavLink } from "react-router-dom";

function Navbar() {
  return (
    <nav className="app-navbar">
      <NavLink to="/" className="app-brand">
        <span className="app-brand-mark">EG</span>
        <span className="app-brand-copy">
          <strong>EraseGraph</strong>
          <span>Verifiable deletion orchestration</span>
        </span>
      </NavLink>

      <div className="app-nav-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          Overview
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          History
        </NavLink>
        <NavLink
          to="/users"
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          Demo Users
        </NavLink>
        <NavLink
          to="/submit"
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          Submit Request
        </NavLink>
        <NavLink
          to="/bulk"
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          Bulk Upload
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `app-nav-link${isActive ? " active" : ""}`
          }
        >
          Admin
        </NavLink>
      </div>
    </nav>
  );
}

export default Navbar;
