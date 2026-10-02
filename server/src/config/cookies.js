export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
export const loginCookieOptions = () => ({ ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
