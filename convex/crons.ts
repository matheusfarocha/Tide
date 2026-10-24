import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Refresh the research library from the Apify Actor once a day (not per session). */
crons.cron("refresh research library", "0 10 * * *", internal.research.refresh, {});

export default crons;
