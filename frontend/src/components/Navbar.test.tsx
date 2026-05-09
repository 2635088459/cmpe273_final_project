import { render, screen } from "@testing-library/react";
import Navbar from "./Navbar";

jest.mock(
  "react-router-dom",
  () => ({
    NavLink: ({ children }: { children: any }) => <>{children}</>,
  }),
  { virtual: true },
);

describe("Navbar", () => {
  it("renders brand and key navigation links", () => {
    render(<Navbar />);

    expect(screen.getByText(/EraseGraph/i)).toBeInTheDocument();
    expect(screen.getByText(/Verifiable deletion orchestration/i)).toBeInTheDocument();
    expect(screen.getByText(/Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/History/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo Users/i)).toBeInTheDocument();
    expect(screen.getByText(/Submit Request/i)).toBeInTheDocument();
    expect(screen.getByText(/Bulk Upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin/i)).toBeInTheDocument();
  });
});
