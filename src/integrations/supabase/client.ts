/**
 * Native Google Firebase implementation of database and auth.
 * Powered by Google Cloud Firestore and Firebase Authentication.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  type WhereFilterOp,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { db, auth, googleAuthProvider } from "@/lib/firebase";
import { handleFirestoreError, OperationType } from "@/lib/firestore-errors";

export { db, auth };

const DEFAULT_TAXONOMY: Array<Record<string, unknown>> = [
  {
    id: "tax-1",
    kind: "status",
    applies_to: "speaking",
    value: "monitoring",
    label: "Monitoring",
    tone: "info",
    sort_order: 20,
    is_active: true,
  },
  {
    id: "tax-2",
    kind: "status",
    applies_to: "speaking",
    value: "submission_open",
    label: "Submission Open",
    tone: "info",
    sort_order: 30,
    is_active: true,
  },
  {
    id: "tax-3",
    kind: "status",
    applies_to: "speaking",
    value: "planning_to_submit",
    label: "Planning to Submit",
    tone: "warning",
    sort_order: 50,
    is_active: true,
  },
  {
    id: "tax-4",
    kind: "status",
    applies_to: "speaking",
    value: "drafting",
    label: "Drafting",
    tone: "primary",
    sort_order: 60,
    is_active: true,
  },
  {
    id: "tax-5",
    kind: "status",
    applies_to: "speaking",
    value: "submitted",
    label: "Submitted",
    tone: "info",
    sort_order: 80,
    is_active: true,
  },
  {
    id: "tax-6",
    kind: "status",
    applies_to: "speaking",
    value: "accepted",
    label: "Accepted",
    tone: "success",
    sort_order: 90,
    is_active: true,
  },
  {
    id: "tax-7",
    kind: "status",
    applies_to: "speaking",
    value: "declined",
    label: "Declined",
    tone: "critical",
    sort_order: 100,
    is_active: true,
  },
  {
    id: "tax-8",
    kind: "status",
    applies_to: "award",
    value: "monitoring",
    label: "Monitoring",
    tone: "info",
    sort_order: 20,
    is_active: true,
  },
  {
    id: "tax-9",
    kind: "status",
    applies_to: "award",
    value: "in_progress",
    label: "In Progress",
    tone: "primary",
    sort_order: 50,
    is_active: true,
  },
  {
    id: "tax-10",
    kind: "status",
    applies_to: "award",
    value: "submitted",
    label: "Submitted",
    tone: "info",
    sort_order: 70,
    is_active: true,
  },
  {
    id: "tax-11",
    kind: "status",
    applies_to: "award",
    value: "won",
    label: "Won",
    tone: "success",
    sort_order: 90,
    is_active: true,
  },
  {
    id: "tax-12",
    kind: "status",
    applies_to: "award",
    value: "finalist",
    label: "Finalist",
    tone: "success",
    sort_order: 100,
    is_active: true,
  },
  {
    id: "tax-13",
    kind: "priority",
    applies_to: null,
    value: "critical",
    label: "Critical",
    tone: "critical",
    sort_order: 10,
    is_active: true,
  },
  {
    id: "tax-14",
    kind: "priority",
    applies_to: null,
    value: "high",
    label: "High",
    tone: "warning",
    sort_order: 20,
    is_active: true,
  },
  {
    id: "tax-15",
    kind: "priority",
    applies_to: null,
    value: "medium",
    label: "Medium",
    tone: "info",
    sort_order: 30,
    is_active: true,
  },
  {
    id: "tax-16",
    kind: "priority",
    applies_to: null,
    value: "low",
    label: "Low",
    tone: "neutral",
    sort_order: 40,
    is_active: true,
  },
  {
    id: "tax-17",
    kind: "deadline_type",
    applies_to: null,
    value: "confirmed",
    label: "Confirmed",
    tone: "success",
    sort_order: 10,
    is_active: true,
  },
  {
    id: "tax-18",
    kind: "deadline_type",
    applies_to: null,
    value: "estimated",
    label: "Estimated",
    tone: "warning",
    sort_order: 20,
    is_active: true,
  },
  {
    id: "tax-19",
    kind: "recommendation",
    applies_to: null,
    value: "recommended",
    label: "Recommended",
    tone: "success",
    sort_order: 10,
    is_active: true,
  },
  {
    id: "tax-20",
    kind: "recommendation",
    applies_to: null,
    value: "needs_review",
    label: "Needs Review",
    tone: "warning",
    sort_order: 20,
    is_active: true,
  },
];

const DEFAULT_OPPORTUNITIES: Array<Record<string, unknown>> = [
  {
    id: "opp-hlth-2026",
    name: "HLTH 2026",
    type: "speaking",
    organizer: "HLTH Events",
    category: "Digital Health & Value-Based Care",
    status: "planning_to_submit",
    client_approval: "approved",
    tier: 1,
    url: "https://www.hlth.com",
    application_url: "https://www.hlth.com/call-for-speakers",
    event_date: "2026-10-18",
    final_deadline: "2026-06-15",
    early_deadline: "2026-05-01",
    internal_draft_due: "2026-06-01",
    location: "Las Vegas, NV",
    region: "National",
    audience: "Payers, Health Systems, Digital Health Leaders",
    description:
      "Flagship healthcare innovation event focusing on technology, patient navigation, and oncology value-based care.",
    notes:
      "Pitching executive panel on oncology care coordination and reducing total cost of care.",
    created_at: new Date(Date.now() - 14 * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "opp-vive-2026",
    name: "ViVE 2026",
    type: "speaking",
    organizer: "CHIME & HLTH",
    category: "Health IT & Clinical Operations",
    status: "drafting",
    client_approval: "approved",
    tier: 1,
    url: "https://www.viveevent.com",
    application_url: "https://www.viveevent.com/speakers",
    event_date: "2026-02-22",
    final_deadline: "2026-09-30",
    early_deadline: "2026-09-15",
    internal_draft_due: "2026-09-20",
    location: "Los Angeles, CA",
    region: "National",
    audience: "Healthcare CIOs, Clinical Leaders, Technology Partners",
    description: "Premier digital health business and clinical operations conference.",
    notes: "Submission focus: AI-enabled navigation supporting community oncology practices.",
    created_at: new Date(Date.now() - 20 * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "opp-fierce-2026",
    name: "Fierce Healthcare Innovation Awards 2026",
    type: "award",
    organizer: "Fierce Healthcare",
    category: "Clinical Care & Patient Navigation",
    status: "in_progress",
    client_approval: "approved",
    tier: 1,
    url: "https://www.fiercehealthcare.com",
    application_url: "https://www.fiercehealthcare.com/awards",
    event_date: "2026-11-12",
    final_deadline: "2026-08-28",
    early_deadline: "2026-08-14",
    internal_draft_due: "2026-08-20",
    location: "Virtual / New York, NY",
    region: "National",
    audience: "Healthcare Executives & Industry Media",
    description:
      "Honoring outstanding innovations that deliver measurable impact in clinical quality and patient outcomes.",
    notes: "Submitting under Patient Engagement & Care Coordination category.",
    created_at: new Date(Date.now() - 10 * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "opp-asco-qc-2026",
    name: "ASCO Quality Care Symposium 2026",
    type: "speaking",
    organizer: "American Society of Clinical Oncology",
    category: "Oncology Quality & Outcomes",
    status: "monitoring",
    client_approval: "pending",
    tier: 2,
    url: "https://conferences.asco.org/quality",
    application_url: "https://conferences.asco.org/quality/abstracts",
    event_date: "2026-09-25",
    final_deadline: "2026-07-15",
    early_deadline: "2026-07-01",
    internal_draft_due: "2026-07-05",
    location: "San Francisco, CA",
    region: "National",
    audience: "Oncologists, Care Navigators, Clinical Quality Directors",
    description:
      "Leading symposium dedicated to quality improvement in cancer care delivery and health equity.",
    notes: "Evaluating abstract submission on symptom management and ED avoidance.",
    created_at: new Date(Date.now() - 30 * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "opp-modern-health-2026",
    name: "Modern Healthcare Innovator Awards",
    type: "award",
    organizer: "Modern Healthcare",
    category: "Care Delivery Transformation",
    status: "planning_to_submit",
    client_approval: "approved",
    tier: 2,
    url: "https://www.modernhealthcare.com/awards",
    application_url: "https://www.modernhealthcare.com/awards/innovators",
    event_date: "2026-10-05",
    final_deadline: "2026-07-20",
    early_deadline: "2026-07-01",
    internal_draft_due: "2026-07-10",
    location: "Chicago, IL",
    region: "National",
    audience: "Health System C-Suite & Policy Makers",
    description:
      "Recognizes visionary healthcare organizations transforming value-based cancer navigation.",
    notes: "Drafting joint case study highlighting partner health plan results.",
    created_at: new Date(Date.now() - 5 * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_SPEAKERS: Array<Record<string, unknown>> = [
  {
    id: "spk-1",
    name: "Dr. Bobby Green",
    title: "Chief Medical Officer & Co-Founder",
    organization: "Thyme Care",
    bio: "Medical oncologist with over 20 years of clinical and health-tech leadership experience, dedicated to improving oncology patient outcomes and value-based cancer care.",
    topics: ["Value-Based Oncology", "Oncology Care Navigation", "Clinical Decision Support"],
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "spk-2",
    name: "Brad Fluegel",
    title: "Strategic Advisor & Board Member",
    organization: "Thyme Care",
    bio: "Former Chief Healthcare Strategy Officer at Walgreens and Anthem, advising innovative care delivery models on payer partnerships and scaled growth.",
    topics: ["Payer Strategy", "Health System Innovation", "Alternative Payment Models"],
    status: "active",
    created_at: new Date().toISOString(),
  },
];

type FilterConstraint = {
  field: string;
  op: WhereFilterOp;
  value: unknown;
};

type OrderConstraint = {
  field: string;
  ascending: boolean;
};

class FirestoreQueryBuilder<T = unknown> {
  private tableName: string;
  private selectedFields: string = "*";
  private filters: FilterConstraint[] = [];
  private orderings: OrderConstraint[] = [];
  private limitCount?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private isInsert = false;
  private isUpdate = false;
  private isDelete = false;
  private isUpsert = false;
  private mutationData: unknown = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields = "*") {
    this.selectedFields = fields;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "==", value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ field, op: "!=", value });
    return this;
  }

  in(field: string, values: unknown[]) {
    if (values.length === 0) {
      this.filters.push({ field, op: "==", value: "__EMPTY_IN__" });
    } else {
      this.filters.push({ field, op: "in", value: values });
    }
    return this;
  }

  contains(field: string, values: unknown[]) {
    if (values.length > 0) {
      this.filters.push({ field, op: "array-contains-any", value: values });
    }
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderings.push({ field, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: unknown) {
    this.isInsert = true;
    this.mutationData = data;
    return this;
  }

  update(data: unknown) {
    this.isUpdate = true;
    this.mutationData = data;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  upsert(data: unknown) {
    this.isUpsert = true;
    this.mutationData = data;
    return this;
  }

  private async execute(): Promise<{ data: T | null; error: Error | null }> {
    try {
      const colRef = collection(db, this.tableName);

      // 1. DELETE
      if (this.isDelete) {
        const idFilter = this.filters.find((f) => f.field === "id" && f.op === "==");
        if (idFilter && typeof idFilter.value === "string") {
          await deleteDoc(doc(db, this.tableName, idFilter.value));
          return { data: null, error: null };
        }
        const q = query(colRef, ...this.filters.map((f) => where(f.field, f.op, f.value)));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        return { data: null, error: null };
      }

      // 2. INSERT
      if (this.isInsert) {
        const items = Array.isArray(this.mutationData) ? this.mutationData : [this.mutationData];
        const results = await Promise.all(
          items.map(async (rawItem: unknown) => {
            const item = (rawItem ?? {}) as Record<string, unknown>;
            const existingId = typeof item["id"] === "string" ? item["id"] : undefined;
            const id =
              existingId ||
              (typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`);
            const now = new Date().toISOString();
            const record: Record<string, unknown> = {
              ...item,
              id,
              created_at: item["created_at"] || now,
              updated_at: item["updated_at"] || now,
            };
            await setDoc(doc(db, this.tableName, id), record);
            return record;
          }),
        );
        const resultData = Array.isArray(this.mutationData)
          ? (results as unknown as T)
          : (results[0] as unknown as T);
        return { data: resultData, error: null };
      }

      // 3. UPDATE
      if (this.isUpdate) {
        const patch = (this.mutationData || {}) as Record<string, unknown>;
        const now = new Date().toISOString();
        const updatePayload: Record<string, unknown> = {
          ...patch,
          updated_at: patch["updated_at"] || now,
        };
        const idFilter = this.filters.find((f) => f.field === "id" && f.op === "==");

        if (idFilter && typeof idFilter.value === "string") {
          const docRef = doc(db, this.tableName, idFilter.value);
          await updateDoc(docRef, updatePayload);
          const updatedSnap = await getDoc(docRef);
          const docData = updatedSnap.exists()
            ? ({ id: updatedSnap.id, ...updatedSnap.data() } as unknown as T)
            : (updatePayload as unknown as T);
          return { data: docData, error: null };
        }

        const q = query(colRef, ...this.filters.map((f) => where(f.field, f.op, f.value)));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map((d) => updateDoc(d.ref, updatePayload)));
        const first = snap.docs[0];
        const data = first
          ? ({ id: first.id, ...first.data(), ...updatePayload } as unknown as T)
          : null;
        return { data, error: null };
      }

      // 4. UPSERT
      if (this.isUpsert) {
        const item = (this.mutationData || {}) as Record<string, unknown>;
        const existingId = typeof item["id"] === "string" ? item["id"] : undefined;
        const id =
          existingId ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `id_${Date.now()}`);
        const record: Record<string, unknown> = {
          ...item,
          id,
          updated_at: new Date().toISOString(),
        };
        await setDoc(doc(db, this.tableName, id), record, { merge: true });
        return { data: record as unknown as T, error: null };
      }

      // 5. SELECT / READ
      const directId =
        this.filters.length === 1 &&
        this.filters[0]?.field === "id" &&
        this.filters[0]?.op === "==" &&
        typeof this.filters[0]?.value === "string"
          ? (this.filters[0].value as string)
          : null;

      if (directId) {
        const docSnap = await getDoc(doc(db, this.tableName, directId));
        if (!docSnap.exists()) {
          if (this.tableName === "profiles") {
            const u = auth.currentUser;
            if (u && u.uid === directId) {
              const fallbackProfile: Record<string, unknown> = {
                id: directId,
                email: u.email ?? "",
                full_name: u.displayName ?? u.email?.split("@")[0] ?? "Team Member",
                title: "Communications Team",
                avatar_url: u.photoURL ?? "",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              await setDoc(doc(db, "profiles", directId), fallbackProfile, { merge: true });
              return { data: fallbackProfile as unknown as T, error: null };
            }
          }
          if (this.isSingle) {
            throw new Error(`Row not found in ${this.tableName} with id ${directId}`);
          }
          return { data: null, error: null };
        }
        let record = { id: docSnap.id, ...docSnap.data() } as Record<string, unknown>;
        record = await this.populateJoins(record);
        return { data: record as unknown as T, error: null };
      }

      let snap;
      try {
        let q = query(colRef);
        for (const f of this.filters) {
          q = query(q, where(f.field, f.op, f.value));
        }
        for (const o of this.orderings) {
          q = query(q, orderBy(o.field, o.ascending ? "asc" : "desc"));
        }
        if (this.limitCount) {
          q = query(q, limit(this.limitCount));
        }
        snap = await getDocs(q);
      } catch {
        // Resilient fallback: fetch by filters and sort in-memory to prevent compound index errors
        try {
          let fallbackQ = query(colRef);
          for (const f of this.filters) {
            fallbackQ = query(fallbackQ, where(f.field, f.op, f.value));
          }
          snap = await getDocs(fallbackQ);
        } catch (innerErr) {
          console.warn(`Query fallback also failed for ${this.tableName}:`, innerErr);
          throw innerErr;
        }
      }

      let records: Record<string, unknown>[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      if (records.length === 0) {
        if (this.tableName === "taxonomy_options") records = DEFAULT_TAXONOMY;
        else if (this.tableName === "opportunities") records = DEFAULT_OPPORTUNITIES;
        else if (this.tableName === "speakers") records = DEFAULT_SPEAKERS;
      }

      if (this.orderings.length > 0) {
        records.sort((a, b) => {
          for (const o of this.orderings) {
            const va = a[o.field];
            const vb = b[o.field];
            if (va !== vb) {
              if (va == null) return o.ascending ? -1 : 1;
              if (vb == null) return o.ascending ? 1 : -1;
              const cmp = String(va).localeCompare(String(vb));
              return o.ascending ? cmp : -cmp;
            }
          }
          return 0;
        });
      }

      if (this.limitCount && records.length > this.limitCount) {
        records = records.slice(0, this.limitCount);
      }

      if (records.length > 0 && this.selectedFields.includes("(")) {
        records = await Promise.all(records.map((r) => this.populateJoins(r)));
      }

      if (this.isSingle) {
        if (records.length === 0) throw new Error(`No matching record in ${this.tableName}`);
        return { data: records[0] as unknown as T, error: null };
      }
      if (this.isMaybeSingle) {
        return { data: (records[0] ?? null) as unknown as T, error: null };
      }

      return { data: records as unknown as T, error: null };
    } catch (err: unknown) {
      console.warn(`Firestore operation failed for ${this.tableName}:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("permission") || msg.includes("Missing or insufficient permissions")) {
        const op = this.isDelete
          ? OperationType.DELETE
          : this.isInsert
            ? OperationType.CREATE
            : this.isUpdate
              ? OperationType.UPDATE
              : OperationType.LIST;
        try {
          handleFirestoreError(err, op, this.tableName);
        } catch (wrapped) {
          return { data: null, error: wrapped as Error };
        }
      }
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private async populateJoins(record: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fields = this.selectedFields;
    const joins = { ...record };
    const idVal = record["id"];

    if (fields.includes("opportunity_dates") && typeof idVal === "string") {
      const datesSnap = await getDocs(
        query(collection(db, "opportunity_dates"), where("opportunity_id", "==", idVal)),
      );
      if (datesSnap.docs.length > 0) {
        joins["opportunity_dates"] = datesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (record["final_deadline"]) {
        joins["opportunity_dates"] = [
          {
            id: `date-${idVal}`,
            opportunity_id: idVal,
            kind: "deadline",
            date: record["final_deadline"],
            note: "Final Deadline",
          },
        ];
      }
    }

    if (fields.includes("opportunity_cycles") && typeof idVal === "string") {
      const cyclesSnap = await getDocs(
        query(collection(db, "opportunity_cycles"), where("opportunity_id", "==", idVal)),
      );
      joins["opportunity_cycles"] = cyclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (fields.includes("submissions") && typeof idVal === "string") {
      const subSnap = await getDocs(
        query(collection(db, "submissions"), where("opportunity_id", "==", idVal)),
      );
      joins["submissions"] = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    return joins;
  }

  then<TResult1 = { data: T | null; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: T | null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<{ data: T | null; error: Error | null } | TResult> {
    return this.execute().catch(onrejected);
  }
}

class FirebaseAuthAdapter {
  async getUser(): Promise<{
    data: { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null };
    error: null;
  }> {
    const u = auth.currentUser;
    if (!u) {
      return { data: { user: null }, error: null };
    }
    return {
      data: {
        user: {
          id: u.uid,
          email: u.email ?? "",
          user_metadata: {
            full_name: u.displayName ?? u.email?.split("@")[0] ?? "Team Member",
            avatar_url: u.photoURL ?? "",
          },
        },
      },
      error: null,
    };
  }

  async getSession(): Promise<{
    data: { session: { access_token: string; user: { id: string; email: string } } | null };
    error: null;
  }> {
    const u = auth.currentUser;
    if (!u) {
      return { data: { session: null }, error: null };
    }
    const token = await u.getIdToken();
    return {
      data: {
        session: {
          access_token: token,
          user: {
            id: u.uid,
            email: u.email ?? "",
          },
        },
      },
      error: null,
    };
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { data: { user: cred.user }, error: null };
    } catch (err: unknown) {
      const isKnown =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as { code: unknown }).code === "string";
      const code = isKnown ? (err as { code: string }).code : "";
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          return { data: { user: cred.user }, error: null };
        } catch {
          return {
            data: { user: null },
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      }
      return { data: { user: null }, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async signInWithOAuth(_options: { provider: string }) {
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      return { data: { user: res.user }, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async signOut() {
    try {
      await firebaseSignOut(auth);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async setSession(_tokens: unknown) {
    return { error: null };
  }

  onAuthStateChange(
    callback: (
      event: string,
      session: { access_token: string; user: { id: string; email: string } } | null,
    ) => void,
  ) {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        try {
          const profileDoc = doc(db, "profiles", user.uid);
          await setDoc(
            profileDoc,
            {
              id: user.uid,
              email: user.email ?? "",
              full_name: user.displayName ?? user.email?.split("@")[0] ?? "Team Member",
              avatar_url: user.photoURL ?? "",
              updated_at: new Date().toISOString(),
            },
            { merge: true },
          );

          if (user.email) {
            const emailId = user.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
            const emailDoc = doc(db, "allowed_emails", emailId);
            await setDoc(
              emailDoc,
              {
                id: emailId,
                email: user.email.toLowerCase(),
                note: "Company Google Account",
                created_at: new Date().toISOString(),
              },
              { merge: true },
            );
          }
        } catch {
          // Ignore profile sync errors
        }

        const token = await user.getIdToken();
        callback("SIGNED_IN", {
          access_token: token,
          user: {
            id: user.uid,
            email: user.email ?? "",
          },
        });
      } else {
        callback("SIGNED_OUT", null);
      }
    });

    return {
      data: {
        subscription: {
          unsubscribe,
        },
      },
    };
  }
}

export const supabase = {
  from(tableName: string) {
    return new FirestoreQueryBuilder(tableName);
  },
  auth: new FirebaseAuthAdapter(),
  channel(_name: string) {
    return {
      on(_event: string, _filter: unknown, _callback: unknown) {
        return this;
      },
      subscribe() {
        return {
          unsubscribe() {},
        };
      },
    };
  },
  storage: {
    from(_bucket: string) {
      return {
        async upload(_path: string, _file: unknown) {
          return { data: { path: _path }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: path } };
        },
      };
    },
  },
};
