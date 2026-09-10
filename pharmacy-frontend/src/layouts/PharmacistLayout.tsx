import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

function PharmacistLayout() {
  return (
    <div className="pharmacist-layout">
      <Navbar />
      <Outlet />
    </div>
  );
}

export default PharmacistLayout;
