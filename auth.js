/**
 * auth.js - Authentication & Session Management for AI Explorer
 * 
 * IMPORTANT DEMO & SECURITY NOTICE:
 * This system uses browser localStorage and client-side Web Crypto API (SHA-256 with salt)
 * for demonstration and prototype purposes. It does not replace a secure backend server.
 * Data stored in localStorage can be inspected by anyone with access to the browser,
 * and accounts are isolated to this specific browser and origin.
 */

const AUTH_STORAGE_KEYS = {
  USERS: "ai_explorer_users",
  SESSION: "ai_explorer_session"
};

/**
 * Retrieve all registered users from localStorage.
 * Handles missing or corrupted data gracefully.
 * @returns {Array<Object>} List of user objects
 */
function getRegisteredUsers() {
  try {
    const rawData = localStorage.getItem(AUTH_STORAGE_KEYS.USERS);
    if (!rawData) return [];
    const parsed = JSON.parse(rawData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Could not read stored users. Resetting to empty list.", error);
    return [];
  }
}

/**
 * Persist users array to localStorage.
 * @param {Array<Object>} users
 */
function saveRegisteredUsers(users) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEYS.USERS, JSON.stringify(users));
  } catch (error) {
    console.error("Failed to save users to localStorage:", error);
    throw new Error("Unable to save account. Storage might be full or disabled.");
  }
}

/**
 * Retrieve the currently logged-in user session.
 * @returns {Object|null} The session user or null if not logged in
 */
function getCurrentUser() {
  try {
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEYS.SESSION);
    if (!rawSession) return null;
    return JSON.parse(rawSession);
  } catch (error) {
    console.warn("Could not parse current session:", error);
    localStorage.removeItem(AUTH_STORAGE_KEYS.SESSION);
    return null;
  }
}

/**
 * Store the active session in localStorage.
 * Never stores raw passwords or hashes in the session object.
 * @param {Object} user 
 */
function setCurrentSession(user) {
  const sessionData = {
    id: user.id || Date.now().toString(),
    name: user.name,
    email: user.email.toLowerCase().trim(),
    loggedInAt: new Date().toISOString()
  };
  localStorage.setItem(AUTH_STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
}

/**
 * Clear the current user session.
 */
function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEYS.SESSION);
}

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  let hexString = "";
  for (let i = 0; i < byteArray.length; i++) {
    hexString += byteArray[i].toString(16).padStart(2, "0");
  }
  return hexString;
}

/**
 * Generate a cryptographically strong random salt (16 bytes = 32 hex chars).
 * Falls back to Math.random if Web Crypto is unavailable.
 * @returns {string}
 */
function generateSalt() {
  if (window.crypto && window.crypto.getRandomValues) {
    const randomBytes = new Uint8Array(16);
    window.crypto.getRandomValues(randomBytes);
    return bufferToHex(randomBytes);
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * Hash a password string with a unique per-account salt using the Web Crypto API (SHA-256).
 * If the Web Crypto API is unavailable in older browsers or non-secure contexts,
 * a deterministic fallback hash is applied.
 * @param {string} password 
 * @param {string} salt 
 * @returns {Promise<string>} Hexadecimal hash string
 */
async function hashPassword(password, salt) {
  const combined = `${salt}:${password}`;

  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      return bufferToHex(hashBuffer);
    } catch (e) {
      console.warn("Web Crypto subtle.digest failed, falling back to basic hash:", e);
    }
  }

  // Graceful fallback hashing for unsupported environments
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }
  return "fb_" + (Math.abs(hash1).toString(16) + Math.abs(hash2).toString(16));
}

/**
 * Validate an email format.
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailRegex.test(String(email).trim());
}

/**
 * Register a new user account.
 * Validates all fields, rejects duplicate emails (case-insensitive),
 * generates a random salt, and stores hashed password in localStorage.
 * 
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.confirmPassword
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function registerUser({ name, email, password, confirmPassword }) {
  const trimmedName = (name || "").trim();
  const trimmedEmail = (email || "").trim().toLowerCase();
  const rawPassword = password || "";
  const rawConfirm = confirmPassword || "";

  // 1. Required fields check
  if (!trimmedName) {
    return { success: false, message: "Please enter your full name." };
  }
  if (!trimmedEmail) {
    return { success: false, message: "Please enter your email address." };
  }
  if (!rawPassword) {
    return { success: false, message: "Please enter a password." };
  }
  if (!rawConfirm) {
    return { success: false, message: "Please confirm your password." };
  }

  // 2. Email format validation
  if (!isValidEmail(trimmedEmail)) {
    return { success: false, message: "Please enter a valid email address (e.g., name@example.com)." };
  }

  // 3. Password length check
  if (rawPassword.length < 6) {
    return { success: false, message: "Password must be at least 6 characters long." };
  }

  // 4. Passwords match check
  if (rawPassword !== rawConfirm) {
    return { success: false, message: "Passwords do not match. Please verify and try again." };
  }

  // 5. Duplicate email check (case-insensitive)
  const users = getRegisteredUsers();
  const existingUser = users.find((u) => u.email && u.email.toLowerCase() === trimmedEmail);
  if (existingUser) {
    return { success: false, message: "An account with this email address already exists. Please log in." };
  }

  // 6. Generate salt & hash password
  const salt = generateSalt();
  const passwordHash = await hashPassword(rawPassword, salt);

  // 7. Store new user record
  const newUser = {
    id: "usr_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    name: trimmedName,
    email: trimmedEmail,
    salt: salt,
    passwordHash: passwordHash,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveRegisteredUsers(users);

  return {
    success: true,
    message: "Account created successfully! Redirecting you to login..."
  };
}

/**
 * Authenticate a user with email and password.
 * Checks registered accounts, hashes input with stored salt,
 * and matches passwordHash.
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, message: string, user?: Object}>}
 */
async function loginUser(email, password) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  const rawPassword = password || "";

  if (!trimmedEmail) {
    return { success: false, message: "Please enter your email address." };
  }
  if (!rawPassword) {
    return { success: false, message: "Please enter your password." };
  }

  const users = getRegisteredUsers();
  const user = users.find((u) => u.email && u.email.toLowerCase() === trimmedEmail);

  // Unregistered email check
  if (!user) {
    return { success: false, message: "No account found with this email. Please check your spelling or sign up." };
  }

  // Verify password with the user's unique salt
  const enteredHash = await hashPassword(rawPassword, user.salt || "");
  if (enteredHash !== user.passwordHash) {
    return { success: false, message: "Incorrect password. Please try again." };
  }

  // Maintain login session
  setCurrentSession(user);

  return {
    success: true,
    message: "Login successful! Welcome back.",
    user: {
      name: user.name,
      email: user.email
    }
  };
}

/**
 * Logout the user and redirect to login page.
 */
function logoutUser() {
  clearSession();
  window.location.href = "login.html";
}

/**
 * Route protection: Call on private pages (like index.html).
 * If no session exists, redirects to login.html.
 */
function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.replace("login.html");
  }
  return user;
}

/**
 * Route protection: Call on public auth pages (like login.html or signup.html).
 * If user is already logged in, redirects to index.html.
 */
function redirectIfAuthenticated() {
  const user = getCurrentUser();
  if (user) {
    window.location.replace("index.html");
  }
}

/**
 * Reusable particle background for login and signup pages,
 * preserving the exact look and feel of AI Explorer.
 */
function initBackgroundParticles() {
  const canvas = document.getElementById("particle-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const cursor = { x: -1000, y: -1000, active: false };
  let particles = [];
  let animId;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.min(160, Math.max(60, Math.floor((window.innerWidth * window.innerHeight) / 9000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.8 + 0.6,
      depth: Math.random() * 0.8 + 0.2,
      speedX: (Math.random() - 0.5) * 0.25,
      speedY: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.45 + 0.15,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function animate(time = 0) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach((p) => {
      p.x += p.speedX * p.depth;
      p.y += p.speedY * p.depth;
      if (p.x < -10) p.x = window.innerWidth + 10;
      if (p.x > window.innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = window.innerHeight + 10;
      if (p.y > window.innerHeight + 10) p.y = -10;

      const dx = cursor.x - p.x;
      const dy = cursor.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (cursor.active && dist < 170 && dist > 0) {
        const force = (170 - dist) / 170;
        p.x -= (dx / dist) * force * 1.25;
        p.y -= (dy / dist) * force * 1.25;
      }
      const glow = Math.sin(time * 0.001 + p.phase) * 0.14;
      const cursorGlow = cursor.active && dist < 170 ? (170 - dist) / 170 : 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + cursorGlow * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(98, 200, 255, ${Math.max(0.08, p.alpha + glow + cursorGlow * 0.45)})`;
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
        if (dist < 110) {
          const opacity = (1 - dist / 110) * 0.15;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(98, 200, 255, ${opacity})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    if (cursor.active) {
      const halo = ctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 145);
      halo.addColorStop(0, "rgba(98, 200, 255, 0.14)");
      halo.addColorStop(1, "rgba(98, 200, 255, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cursor.x - 145, cursor.y - 145, 290, 290);
    }
    animId = requestAnimationFrame(animate);
  }

  window.addEventListener("pointermove", (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.active = true;
  });
  window.addEventListener("pointerleave", () => { cursor.active = false; });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(animId);
    else animId = requestAnimationFrame(animate);
  });

  resize();
  animate();
}
