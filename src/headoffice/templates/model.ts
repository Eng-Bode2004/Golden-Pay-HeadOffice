/** Types and labels for Head Office template management. Mirrors Shared/templates on the server. */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "phone"
  | "national_id"
  | "choice"
  | "multichoice"
  | "yesno"
  | "photos"
  | "signature"
  | "table"
  | "attestation";

export type ConditionOp = "eq" | "neq" | "in" | "not_in" | "filled" | "empty" | "gt" | "lt" | "contains";
export interface Condition {
  field: string;
  op: ConditionOp;
  value?: string | number | string[];
}

export interface EvidenceRequirement {
  type: "gps" | "photos" | "filled";
  max_meters?: number;
  field?: string;
  min?: number;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  required_if?: Condition;
  visible_if?: Condition;
  help?: string;
  options?: string[];
  default?: string;
  prefill?: string;
  validation?: { min?: number; max?: number; min_length?: number; max_length?: number; pattern?: string; pattern_message?: string };
  min_items?: number;
  max_items?: number;
  columns?: FieldDef[];
  min_rows?: number;
  max_rows?: number;
  block?: string;
  statement?: string;
  evidence?: { kind: "visit" | "interview" | "document" | "verification"; requires: EvidenceRequirement[] };
}

export interface SectionDef {
  id: string;
  title: string;
  visible_if?: Condition;
  fields: FieldDef[];
}

export interface Definition {
  schema: 2;
  sections: SectionDef[];
  rules?: unknown[];
}

export type SlotKind = "cell" | "inline" | "checkbox" | "choose" | "image" | "rows" | "statement";
export interface Slot {
  anchor: string;
  kind: SlotKind;
  part: string;
  label: string;
  text: string;
  section: string;
  options?: string[];
  option?: string;
  group?: string;
  image?: { md5: string; role: string; cx: number; cy: number };
  rows?: { anchors: string[]; columns: string[] };
  sample?: boolean;
  /** A drawn box floating at a fixed spot: how far Head Office moved it sideways, in mm. */
  nudge?: number;
}

export type BindingAction = "text" | "check" | "choose" | "image" | "rows" | "statement" | "clear";
export interface Binding {
  anchor: string;
  action: BindingAction;
  source?: string;
  option?: string;
  columns?: (string | null)[];
}

export interface InventoryWarning {
  code: string;
  message: string;
  severity: "info" | "review" | "block";
}

export interface Inventory {
  sha256: string;
  file_name: string;
  source_path: string | null;
  format: string;
  size: number;
  title: string;
  client: { client_id: string | null; confidence: number; evidence: string[]; suggested: string | null; alternatives: { client_id: string; score: number }[] };
  investigation_type: { code: string | null; name: string | null; confidence: number; evidence: string[] };
  version: { label: string; created_at: string | null; modified_at: string | null; revision: number | null; hints: string[] };
  layout_fingerprint: string;
  stats: { tables: number; checkboxes: number; text_boxes: number; images: number; headers: number; footers: number; page_breaks: number; fonts: string[] };
  warnings: InventoryWarning[];
}

export type VersionStatus = "draft" | "in_review" | "approved" | "active" | "retired";

export interface Version {
  version_id: string;
  template_id: string;
  version_no: number;
  status: VersionStatus;
  layout_mode: "docx" | "standard";
  definition: Definition;
  bindings: Binding[];
  slots: Slot[];
  warnings: InventoryWarning[];
  acknowledged: string[];
  change_note: string | null;
  content_hash: string | null;
  layout_sha256: string | null;
  review_note: string | null;
  created_by: string;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  activated_at: string | null;
  title: string;
  client_id: string;
  client_name: string;
  investigation_type: string | null;
  template_active: boolean;
  active_version_id: string | null;
  created_by_name: string | null;
  submitted_by_name: string | null;
  /** How many page changes can be undone, and the latest one. */
  undo_steps?: number;
  last_change?: string | null;
  reviewed_by_name: string | null;
  activated_by_name: string | null;
}

export interface Check {
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  unplaced: string[];
}

export const STATUS: Record<VersionStatus, { label: string; tone: string }> = {
  draft: { label: "مسودة", tone: "draft" },
  in_review: { label: "قيد المراجعة", tone: "review" },
  approved: { label: "معتمد", tone: "approved" },
  active: { label: "مُفعّل", tone: "active" },
  retired: { label: "مؤرشف", tone: "retired" },
};

export const TYPE_LABELS: Record<FieldType, string> = {
  text: "نص قصير",
  textarea: "نص طويل",
  number: "رقم",
  date: "تاريخ",
  time: "وقت",
  phone: "رقم هاتف",
  national_id: "رقم قومي",
  choice: "اختيار واحد",
  multichoice: "اختيار متعدد",
  yesno: "نعم / لا",
  photos: "صور",
  signature: "توقيع",
  table: "جدول متكرر",
  attestation: "عبارة تحتاج دليلًا",
};

export const OPS: Record<ConditionOp, string> = {
  eq: "يساوي",
  neq: "لا يساوي",
  in: "أحد القيم",
  not_in: "ليس من القيم",
  filled: "مُدخل",
  empty: "فارغ",
  gt: "أكبر من",
  lt: "أقل من",
  contains: "يحتوي",
};

export const PREFILL: Record<string, string> = {
  subject_name: "اسم العميل",
  phone: "هاتف العميل",
  address: "العنوان",
  landmark: "علامة مميزة",
  governorate: "المحافظة",
  district: "المركز / المدينة",
  local_unit: "الوحدة المحلية",
  main_village: "القرية الأم",
  sub_village: "القرية التابعة",
  national_id: "الرقم القومي",
  client_reference: "مرجع العميل",
};

export const EVIDENCE_KINDS: Record<string, string> = {
  visit: "زيارة",
  interview: "مقابلة",
  document: "اطلاع على مستند",
  verification: "تحقق",
};

export const SLOT_KINDS: Record<SlotKind, string> = {
  cell: "خانة",
  inline: "فراغ داخل السطر",
  checkbox: "مربع اختيار",
  choose: "قائمة خيارات مكتوبة",
  image: "صورة",
  rows: "صفوف متكررة",
  statement: "عبارة إقرار",
};

export const ACTIONS: Record<BindingAction, string> = {
  text: "كتابة القيمة",
  check: "علامة على الخيار",
  choose: "إبقاء الخيار المختار",
  image: "إدراج صورة",
  rows: "صف لكل عنصر",
  statement: "تُطبع بدليل فقط",
  clear: "حذف من التقرير",
};

export const IMAGE_ROLES: Record<string, string> = {
  golden_pay_logo: "شعار جولدن باي",
  golden_pay_stamp: "ختم جولدن باي",
  client_logo: "شعار العميل",
  unknown: "صورة غير معروفة",
};

/** Which field types each kind of place can hold. */
export const ACTIONS_FOR_SLOT: Record<SlotKind, BindingAction[]> = {
  cell: ["text", "choose", "image", "clear"],
  inline: ["text", "clear"],
  checkbox: ["check", "clear"],
  choose: ["choose", "text", "clear"],
  image: ["image", "clear"],
  rows: ["rows", "clear"],
  statement: ["statement", "clear"],
};

export const FIELD_TYPES_FOR_ACTION: Record<BindingAction, FieldType[]> = {
  text: ["text", "textarea", "number", "date", "time", "phone", "national_id", "choice", "multichoice", "yesno", "table"],
  check: ["choice", "multichoice", "yesno"],
  choose: ["choice", "yesno", "multichoice"],
  image: ["photos", "signature"],
  rows: ["table"],
  statement: ["attestation"],
  clear: [],
};

export const allFields = (definition: Definition) => definition.sections.flatMap((section) => section.fields);

export function fieldKey(label: string, taken: Set<string>): string {
  let index = 1;
  let key = `f_${Math.random().toString(16).slice(2, 9)}`;
  while (taken.has(key)) key = `f_${Math.random().toString(16).slice(2, 9)}${index++}`;
  void label;
  return key;
}

export const warningId = (warning: { code: string; message: string }) => `${warning.code}:${warning.message}`;

export const SEVERITY: Record<string, string> = { block: "يمنع الاعتماد", review: "للمراجعة", info: "معلومة" };
