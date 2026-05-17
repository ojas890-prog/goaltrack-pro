// ============================================================
//  GoalTrack Pro — Shared State  (state.js)
//  Used across all portal pages via localStorage + Firebase
//
//  Session user shape (written by login.html after Firebase auth):
//  {
//    uid   : string   — Firebase Auth UID
//    name  : string   — Full name  (e.g. "Aryan Sharma")
//    email : string   — Work email
//    role  : string   — 'emp' | 'mgr' | 'adm'
//    dept  : string   — Department
//  }
//
//  Retrieve anywhere with:
//    const user = GTP.getCurrentUser();
//    user.uid / user.name / user.email / user.role / user.dept
// ============================================================

const GTP = {

  // ─────────────────────────────────────────────────────────
  // 1. SESSION / CURRENT USER
  //    Written to localStorage by login.html after Firebase
  //    auth succeeds. Read by every dashboard page.
  // ─────────────────────────────────────────────────────────

  /**
   * Returns the logged-in user object or null if not logged in.
   * Shape: { uid, name, email, role, dept }
   */
  getCurrentUser() {
    const raw = localStorage.getItem('gtp_user');
    return raw ? JSON.parse(raw) : null;
  },

  /**
   * Convenience — returns just the role string: 'emp' | 'mgr' | 'adm'
   */
  getCurrentRole() {
    return localStorage.getItem('gtp_role') || null;
  },

  /**
   * Guard: call at the top of every dashboard page.
   * Redirects to login if no session exists, or if the
   * user's role doesn't match the required role for that page.
   *
   * Usage:
   *   GTP.requireRole('emp');   // on employee-dashboard.html
   *   GTP.requireRole('mgr');   // on manager-dashboard.html
   *   GTP.requireRole('adm');   // on admin-dashboard.html
   */
  requireRole(expectedRole) {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    if (user.role !== expectedRole) {
      // User is logged in but hit the wrong dashboard — redirect
      const roleRedirect = {
        emp: 'employee-dashboard.html',
        mgr: 'manager-dashboard.html',
        adm: 'admin-dashboard.html',
      };
      window.location.href = roleRedirect[user.role] || 'login.html';
      return null;
    }
    return user;
  },

  /**
   * Update the stored user session (e.g. after a profile edit).
   * Only updates localStorage — does NOT write to Firebase.
   * To persist to Firebase call db.ref('users/'+uid).update(patch)
   * from your page script directly.
   */
  updateSessionUser(patch) {
    const user = this.getCurrentUser();
    if (!user) return;
    const updated = { ...user, ...patch };
    localStorage.setItem('gtp_user', JSON.stringify(updated));
  },

  /**
   * Sign out — clears session keys and redirects to login.
   * Also signs out of Firebase Auth if the SDK is loaded.
   */
  logout() {
    localStorage.removeItem('gtp_role');
    localStorage.removeItem('gtp_user');
    // Sign out of Firebase Auth if SDK is present on the page
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().signOut().catch(() => {});
    }
    window.location.href = 'login.html';
  },


  // ─────────────────────────────────────────────────────────
  // 2. INITIALISE LOCAL GOAL/CYCLE DATA
  //    Seeds default cycle + empty goal list for a brand-new
  //    user if nothing exists yet in localStorage.
  //    (Employees/managers are now stored in Firebase RTDB,
  //     not in localStorage. Goals can also be moved to RTDB
  //     in a future sprint — for now they stay local so the
  //     existing dashboards keep working unchanged.)
  // ─────────────────────────────────────────────────────────

  init() {
    // Seed the performance cycle once per browser if absent
    if (!localStorage.getItem('gtp_cycle')) {
      const cycle = {
        id: 'c1',
        year: 2026,
        currentQuarter: 'Q2',
        phases: {
          goalSetting: { open: '2026-05-01', close: '2026-06-30' },
          Q1:          { open: '2026-07-01', close: '2026-07-31' },
          Q2:          { open: '2026-10-01', close: '2026-10-31' },
          Q3:          { open: '2027-01-01', close: '2027-01-31' },
          Q4:          { open: '2027-03-01', close: '2027-04-30' },
        },
      };
      localStorage.setItem('gtp_cycle', JSON.stringify(cycle));
    }

    // Seed empty goals list if absent (goals are created by the
    // logged-in employee — no hardcoded demo data)
    if (!localStorage.getItem('gtp_goals')) {
      localStorage.setItem('gtp_goals', JSON.stringify([]));
    }

    // Seed empty audit log if absent
    if (!localStorage.getItem('gtp_auditLog')) {
      localStorage.setItem('gtp_auditLog', JSON.stringify([]));
    }
  },


  // ─────────────────────────────────────────────────────────
  // 3. EMPLOYEE & MANAGER HELPERS
  //    These now read from localStorage keys that are written
  //    by the Firebase-aware pages (login.html writes the
  //    current user; manager-dashboard.html may cache the
  //    team list from RTDB). Falls back to empty arrays if
  //    not yet populated.
  // ─────────────────────────────────────────────────────────

  /**
   * Returns cached employee list (populated by manager/admin
   * dashboards after fetching from Firebase RTDB).
   */
  getEmployees() {
    return JSON.parse(localStorage.getItem('gtp_employees') || '[]');
  },

  /**
   * Returns cached manager list.
   */
  getManagers() {
    return JSON.parse(localStorage.getItem('gtp_managers') || '[]');
  },

  /**
   * Cache a list of employees fetched from Firebase RTDB.
   * Call this from manager/admin pages after db.ref('employees').get()
   *
   * Example:
   *   const snap = await db.ref('employees').get();
   *   const list = snap.exists() ? Object.values(snap.val()) : [];
   *   GTP.cacheEmployees(list);
   */
  cacheEmployees(list) {
    localStorage.setItem('gtp_employees', JSON.stringify(list));
  },

  /**
   * Cache a list of managers fetched from Firebase RTDB.
   */
  cacheManagers(list) {
    localStorage.setItem('gtp_managers', JSON.stringify(list));
  },

  /**
   * Find a single employee by their Firebase UID from the
   * cached employee list.
   */
  getEmployeeByUid(uid) {
    return this.getEmployees().find(e => e.uid === uid) || null;
  },

  /**
   * Find a single manager by their Firebase UID from the
   * cached manager list.
   */
  getManagerByUid(uid) {
    return this.getManagers().find(m => m.uid === uid) || null;
  },


  // ─────────────────────────────────────────────────────────
  // 4. GOAL CRUD  (localStorage — same API as before)
  // ─────────────────────────────────────────────────────────

  /** Returns all goals from localStorage. */
  getGoals() {
    return JSON.parse(localStorage.getItem('gtp_goals') || '[]');
  },

  /** Returns goals belonging to a specific employee UID. */
  getGoalsByEmployee(uid) {
    return this.getGoals().filter(g => g.employeeId === uid);
  },

  /** Returns goals submitted/approved that belong to the
   *  manager's team (pass array of employee UIDs). */
  getGoalsByTeam(employeeUids) {
    return this.getGoals().filter(g => employeeUids.includes(g.employeeId));
  },

  /** Persist the full goals array. */
  saveGoals(goals) {
    localStorage.setItem('gtp_goals', JSON.stringify(goals));
  },

  /**
   * Add a brand-new goal for the current user.
   * Automatically sets employeeId from the session.
   *
   * @param {object} goalData — all fields except id & employeeId
   * @returns {object} the saved goal with generated id
   */
  addGoal(goalData) {
    const user  = this.getCurrentUser();
    const goals = this.getGoals();
    const goal  = {
      id:         'g' + Date.now(),
      employeeId: user ? user.uid : 'unknown',
      dept:       user ? (user.dept || '') : '',       // ← dept tag for isolation
      managerId:  user ? (user.managerId || '') : '',  // ← manager link for isolation
      cycleId:    'c1',
      status:     'draft',
      locked:     false,
      achievements:     { Q1: null, Q2: null, Q3: null, Q4: null },
      goalStatus:       { Q1: null, Q2: null, Q3: null, Q4: null },
      checkinComments:  { Q1: null, Q2: null, Q3: null, Q4: null },
      ...goalData,
    };
    goals.push(goal);
    this.saveGoals(goals);
    this.addAudit(
      user?.name || 'Unknown',
      this._roleLabel(user?.role),
      'Goal Created',
      `${user?.name} — ${goal.title}`,
      goal.id
    );
    return goal;
  },

  /**
   * Update fields on an existing goal by id.
   * Returns the updated goal or null if not found.
   */
  updateGoal(id, patch) {
    const goals = this.getGoals();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return null;
    goals[idx] = { ...goals[idx], ...patch };
    this.saveGoals(goals);
    return goals[idx];
  },

  /**
   * Delete a goal by id.
   * Returns true if deleted, false if not found.
   */
  deleteGoal(id) {
    const goals = this.getGoals();
    const next  = goals.filter(g => g.id !== id);
    if (next.length === goals.length) return false;
    this.saveGoals(next);
    return true;
  },

  /**
   * Submit a draft goal for manager approval.
   */
  submitGoal(id) {
    const user = this.getCurrentUser();
    const goal = this.updateGoal(id, { status: 'submitted' });
    if (goal) {
      this.addAudit(
        user?.name || 'Unknown',
        this._roleLabel(user?.role),
        'Goal Submitted',
        `${user?.name} — ${goal.title}`,
        id
      );
    }
    return goal;
  },

  /**
   * Approve a submitted goal (manager action).
   */
  approveGoal(id) {
    const user = this.getCurrentUser();
    const goal = this.updateGoal(id, { status: 'approved', locked: true });
    if (goal) {
      this.addAudit(
        user?.name || 'Unknown',
        this._roleLabel(user?.role),
        'Goal Approved',
        `${user?.name} approved — ${goal.title}`,
        id
      );
    }
    return goal;
  },

  /**
   * Reject a submitted goal with an optional reason (manager action).
   */
  rejectGoal(id, reason = '') {
    const user = this.getCurrentUser();
    const goal = this.updateGoal(id, { status: 'rejected', locked: false, rejectReason: reason });
    if (goal) {
      this.addAudit(
        user?.name || 'Unknown',
        this._roleLabel(user?.role),
        'Goal Rejected',
        `${user?.name} rejected — ${goal.title}${reason ? ': ' + reason : ''}`,
        id
      );
    }
    return goal;
  },

  /**
   * Record a quarterly achievement for a goal.
   *
   * @param {string} id         — goal id
   * @param {string} quarter    — 'Q1' | 'Q2' | 'Q3' | 'Q4'
   * @param {*}      value      — the achievement value
   * @param {string} statusStr  — e.g. 'On Track' | 'Completed' | 'At Risk'
   */
  recordAchievement(id, quarter, value, statusStr = 'On Track') {
    const user  = this.getCurrentUser();
    const goals = this.getGoals();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return null;

    goals[idx].achievements[quarter]  = value;
    goals[idx].goalStatus[quarter]    = statusStr;
    this.saveGoals(goals);

    this.addAudit(
      user?.name || 'Unknown',
      this._roleLabel(user?.role),
      `${quarter} Achievement Updated`,
      `${goals[idx].title} — ${value}`,
      id
    );
    return goals[idx];
  },

  /**
   * Add a manager check-in comment for a quarter.
   */
  addCheckinComment(id, quarter, comment) {
    const user  = this.getCurrentUser();
    const goals = this.getGoals();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return null;

    goals[idx].checkinComments[quarter] = comment;
    this.saveGoals(goals);

    this.addAudit(
      user?.name || 'Unknown',
      this._roleLabel(user?.role),
      `${quarter} Check-in Comment Added`,
      goals[idx].title,
      id
    );
    return goals[idx];
  },


  // ─────────────────────────────────────────────────────────
  // 5. CYCLE HELPERS
  // ─────────────────────────────────────────────────────────

  /** Returns the current performance cycle object. */
  getCycle() {
    return JSON.parse(localStorage.getItem('gtp_cycle') || '{}');
  },

  /** Returns the current quarter string e.g. 'Q2'. */
  getCurrentQuarter() {
    return this.getCycle().currentQuarter || 'Q1';
  },

  /** Persist a modified cycle (admin action). */
  saveCycle(cycle) {
    localStorage.setItem('gtp_cycle', JSON.stringify(cycle));
  },

  /**
   * Returns true if a given phase window is currently open.
   * @param {string} phase — 'goalSetting' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
   */
  isPhaseOpen(phase) {
    const cycle = this.getCycle();
    const p     = cycle?.phases?.[phase];
    if (!p) return false;
    const now   = new Date();
    return now >= new Date(p.open) && now <= new Date(p.close);
  },


  // ─────────────────────────────────────────────────────────
  // 6. AUDIT LOG
  // ─────────────────────────────────────────────────────────

  /** Returns full audit log array (newest first). */
  getAudit() {
    return JSON.parse(localStorage.getItem('gtp_auditLog') || '[]');
  },

  /** Persist audit log. */
  saveAudit(log) {
    localStorage.setItem('gtp_auditLog', JSON.stringify(log));
  },

  /**
   * Prepend a new audit entry.
   *
   * @param {string}      actor   — person's name
   * @param {string}      role    — 'Employee' | 'Manager' | 'Admin'
   * @param {string}      action  — short action label
   * @param {string}      target  — what was acted on
   * @param {string|null} goalId  — optional linked goal id
   */
  addAudit(actor, role, action, target, goalId = null) {
    const log = this.getAudit();
    log.unshift({
      id:        'a' + Date.now(),
      timestamp: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16),
      actor,
      role,
      action,
      target,
      goalId,
    });
    // Cap log at 500 entries to avoid bloating localStorage
    if (log.length > 500) log.splice(500);
    this.saveAudit(log);
  },


  // ─────────────────────────────────────────────────────────
  // 7. SCORE COMPUTATION
  // ─────────────────────────────────────────────────────────

  /**
   * Compute achievement score (0–100) for a single goal quarter.
   *
   * UOM types:
   *   numeric / percent     — higher is better, capped at 100
   *   percent_max           — lower is better (e.g. error rate)
   *   timeline              — achieved on/before target date → 100
   *   zero                  — must be zero to score 100
   *
   * @returns {number|null} 0-100, or null if no achievement yet
   */
  computeScore(uom, target, achievement) {
    if (achievement === null || achievement === undefined) return null;
    switch (uom) {
      case 'numeric':
      case 'percent':
        return Math.min(100, Math.round((achievement / target) * 100));
      case 'percent_max':
        return Math.min(100, Math.round((target / achievement) * 100));
      case 'timeline':
        return achievement <= target ? 100 : 0;
      case 'zero':
        return achievement === 0 ? 100 : 0;
      default:
        return null;
    }
  },

  /**
   * Compute weighted overall score for a list of goals
   * for a given quarter.
   *
   * @param  {Array}  goals   — array of goal objects
   * @param  {string} quarter — 'Q1' | 'Q2' | 'Q3' | 'Q4'
   * @returns {number|null}   weighted score 0-100, or null
   */
  computeOverallScore(goals, quarter) {
    const approved = goals.filter(g => g.status === 'approved' && g.weightage > 0);
    if (!approved.length) return null;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const g of approved) {
      const score = this.computeScore(g.uom, g.target, g.achievements[quarter]);
      if (score === null) continue;
      weightedSum  += score * g.weightage;
      totalWeight  += g.weightage;
    }

    if (totalWeight === 0) return null;
    return Math.round(weightedSum / totalWeight);
  },


  // ─────────────────────────────────────────────────────────
  // 8. UTILITY HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Format a date string or Date object to DD MMM YYYY.
   * e.g. '2026-06-30' → '30 Jun 2026'
   */
  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  /**
   * Returns a CSS-friendly status colour token for a goal status string.
   * Use in templates: style="color: var(${GTP.statusColor(s)})"
   */
  statusColor(status) {
    const map = {
      approved:  '--green',
      submitted: '--accent-emp',
      draft:     '--muted',
      rejected:  '--red',
      'On Track':   '--green',
      'Completed':  '--green',
      'At Risk':    '--yellow',
      'Missed':     '--red',
    };
    return map[status] || '--muted';
  },

  /**
   * Returns a human-readable label for a role code.
   * 'emp' → 'Employee', 'mgr' → 'Manager', 'adm' → 'Admin'
   */
  roleLabel(roleCode) {
    return this._roleLabel(roleCode);
  },

  /** @private */
  _roleLabel(roleCode) {
    return { emp: 'Employee', mgr: 'Manager', adm: 'Admin' }[roleCode] || 'Unknown';
  },

  /**
   * Generate a unique ID string (lightweight, not UUID).
   */
  uid() {``
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

};

// ─── Auto-initialise on script load ───────────────────────
GTP.init();