jest.mock("./reportWebVitals", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("./App", () => ({
  __esModule: true,
  default: () => null,
}));

describe("index bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    jest.resetModules();
  });

  it("creates root and renders app", async () => {
    const mockRender = jest.fn();
    const mockCreateRoot = jest.fn(() => ({ render: mockRender }));

    jest.doMock("react-dom/client", () => ({
      __esModule: true,
      default: { createRoot: mockCreateRoot },
      createRoot: mockCreateRoot,
    }));

    await import("./index");

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
