import { Link } from "react-router-dom";

function Navbar() {
return (
<div style={{ padding: "10px", background: "#eee" }}>
<Link to="/" style={{ marginRight: "10px" }}>Home</Link> <Link to="/submit">Submit</Link> </div>
);
}

export default Navbar;
