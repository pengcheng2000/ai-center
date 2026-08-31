export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// 本地认证：跳转到登录页开始登录流程（本地登录流程）。
export const startLogin = () => {
  window.location.href = "/login";
};
