/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** InterviewVeil API base URL, e.g. https://api.interviewveil.app */
  readonly VITE_API_URL?: string;
  /** InterviewVeil website, e.g. https://interviewveil.app */
  readonly VITE_WEB_URL?: string;
}
