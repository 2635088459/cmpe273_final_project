import {
  default as API,
  bulkDeleteCsv,
  createDeletionRequest,
  listDeletionRequests,
  getDeletionProof,
} from "./api";

describe("api service", () => {
  let getSpy: jest.SpyInstance;
  let postSpy: jest.SpyInstance;

  beforeEach(() => {
    getSpy = jest.spyOn(API, "get");
    postSpy = jest.spyOn(API, "post");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("createDeletionRequest posts to /deletions", async () => {
    const expected = {
      request_id: "req-1",
      status: "PENDING",
      message: "ok",
      trace_id: "trace-1",
    };
    postSpy.mockResolvedValueOnce({ data: expected } as any);

    const result = await createDeletionRequest({ subject_id: "alice" });

    expect(result).toEqual(expected);
    expect(postSpy).toHaveBeenCalledWith("/deletions", { subject_id: "alice" });
  });

  it("listDeletionRequests sends query params", async () => {
    const expected = { items: [], count: 0 };
    getSpy.mockResolvedValueOnce({ data: expected } as any);

    const result = await listDeletionRequests({ status: "FAILED", search: "abc", limit: 5 });

    expect(result).toEqual(expected);
    expect(getSpy).toHaveBeenCalledWith("/deletions", {
      params: { status: "FAILED", search: "abc", limit: 5 },
    });
  });

  it("getDeletionProof fetches proof endpoint", async () => {
    const expected = {
      request_id: "req-1",
      subject_id: "alice",
      status: "COMPLETED",
      trace_id: "trace-1",
      proof_events: [],
      verification_summary: {
        total_steps: 5,
        succeeded_steps: 5,
        failed_steps: 0,
        services_involved: [],
      },
    };
    getSpy.mockResolvedValueOnce({ data: expected } as any);

    const result = await getDeletionProof("req-1");

    expect(result).toEqual(expected);
    expect(getSpy).toHaveBeenCalledWith("/deletions/req-1/proof");
  });

  it("bulkDeleteCsv posts multipart form data", async () => {
    const expected = { created: 1, skipped: 0, request_ids: ["r1"], rows: [] };
    postSpy.mockResolvedValueOnce({ data: expected } as any);

    const file = new File(["subject_id\nalice\n"], "input.csv", { type: "text/csv" });
    const result = await bulkDeleteCsv(file);

    expect(result).toEqual(expected);
    expect(postSpy).toHaveBeenCalledWith(
      "/deletions/bulk",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  });
});
