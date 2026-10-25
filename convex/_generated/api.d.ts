/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApi from "../agentApi.js";
import type * as claude from "../claude.js";
import type * as coach from "../coach.js";
import type * as coachParse from "../coachParse.js";
import type * as contract from "../contract.js";
import type * as crons from "../crons.js";
import type * as devCoach from "../devCoach.js";
import type * as feel from "../feel.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as live from "../live.js";
import type * as plans from "../plans.js";
import type * as research from "../research.js";
import type * as reviews from "../reviews.js";
import type * as sessions from "../sessions.js";
import type * as similar from "../similar.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApi: typeof agentApi;
  claude: typeof claude;
  coach: typeof coach;
  coachParse: typeof coachParse;
  contract: typeof contract;
  crons: typeof crons;
  devCoach: typeof devCoach;
  feel: typeof feel;
  history: typeof history;
  http: typeof http;
  leaderboard: typeof leaderboard;
  live: typeof live;
  plans: typeof plans;
  research: typeof research;
  reviews: typeof reviews;
  sessions: typeof sessions;
  similar: typeof similar;
  users: typeof users;
  validators: typeof validators;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
