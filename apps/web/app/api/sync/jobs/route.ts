import { fail, getBackend, ok } from "@/lib/api";

export async function GET() {
  try {
    const { client } = getBackend();
    return ok({ jobs: client.sync.listJobs() });
  } catch (error) {
    return fail(error);
  }
}