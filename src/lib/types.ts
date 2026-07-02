export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type Plan = "free" | "pro";

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "claimed"
  | "confirmed";

export type PaymentKind = "pointer" | "paynow" | "stripe";

// Discriminated union stored in booths.payment (JSONB). No secrets in any
// active kind — a PayNow UEN/mobile, a payment link, and a static QR are all
// public-by-design. `stripe` is reserved but dark (adapter throws).
export type PaymentConfig =
  | { kind: "pointer"; label: string; url?: string; qr_image_url?: string }
  | { kind: "paynow"; payee_name: string; uen?: string; mobile?: string }
  | { kind: "stripe"; account_id: string };

export type OptionChoice = { id: string; label: string };
export type OptionGroup = {
  id: string;
  label: string;
  // false/undefined = single-select (radio, exactly one); true = multi-select
  // (checkbox, zero or more). A multi group emits several SelectedOption rows.
  multiple?: boolean;
  choices: OptionChoice[];
};
export type SelectedOption = { group: string; choice: string };

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  // Vendor's unit cost (optional). Drives margin/profit stats. Never shown to
  // customers — server strips it from the public booth read.
  cost_cents?: number;
  image_url?: string | null;
  available: boolean;
  option_groups?: OptionGroup[];
  // Optional sold-out cap (Pro). null/absent = unlimited. Remaining is computed
  // live from non-cancelled orders (see booth_remaining_stock) — not decremented.
  stock?: number | null;
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
  options?: SelectedOption[];
};

export type OrderItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  // Snapshotted at order time so historical profit is immune to later cost edits.
  cost_cents?: number;
  quantity: number;
  options?: SelectedOption[];
};

export interface Database {
  public: {
    Tables: {
      vendors: {
        Row: {
          id: string;
          name: string;
          plan: Plan;
          created_at: string;
          tour_seen_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          plan?: Plan;
          created_at?: string;
          tour_seen_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: Plan;
          created_at?: string;
          tour_seen_at?: string | null;
        };
        Relationships: [];
      };
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      admin_audit: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          vendor_id: string | null;
          type: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id?: string | null;
          type: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string | null;
          type?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      licenses: {
        Row: {
          id: string;
          vendor_id: string;
          valid_from: string;
          expires_at: string;
          source: string;
          note: string | null;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          valid_from?: string;
          expires_at: string;
          source?: string;
          note?: string | null;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          valid_from?: string;
          expires_at?: string;
          source?: string;
          note?: string | null;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "licenses_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          vendor_id: string;
          kind: "pass" | "subscription";
          amount_cents: number;
          source: string;
          note: string | null;
          license_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          kind: "pass" | "subscription";
          amount_cents: number;
          source?: string;
          note?: string | null;
          license_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          kind?: "pass" | "subscription";
          amount_cents?: number;
          source?: string;
          note?: string | null;
          license_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing: {
        Row: {
          id: number;
          event_pass_cents: number;
          monthly_cents: number;
          currency: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          event_pass_cents?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          event_pass_cents?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          source: "customer" | "vendor";
          vendor_id: string | null;
          booth_id: string | null;
          order_number: string | null;
          rating: number | null;
          nps: number | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: "customer" | "vendor";
          vendor_id?: string | null;
          booth_id?: string | null;
          order_number?: string | null;
          rating?: number | null;
          nps?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: "customer" | "vendor";
          vendor_id?: string | null;
          booth_id?: string | null;
          order_number?: string | null;
          rating?: number | null;
          nps?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_requests: {
        Row: {
          id: string;
          vendor_id: string;
          kind: "event" | "monthly";
          status: "pending" | "resolved";
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          kind: "event" | "monthly";
          status?: "pending" | "resolved";
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          kind?: "event" | "monthly";
          status?: "pending" | "resolved";
          created_at?: string;
        };
        Relationships: [];
      };
      booths: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          menu_items: Json;
          is_active: boolean;
          image_url: string | null;
          hours: Json | null;
          order_seq: number;
          payment: Json | null;
          created_at: string;
          short_code: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booths_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          booth_id: string;
          order_number: string;
          customer_name: string;
          items: Json;
          status: OrderStatus;
          total_cents: number;
          payment_status: PaymentStatus;
          payment_method_kind: PaymentKind | null;
          paid_at: string | null;
          created_at: string;
          ready_at: string | null;
          completed_at: string | null;
          updated_at: string;
          idempotency_key: string | null;
        };
        Insert: {
          id?: string;
          booth_id: string;
          order_number: string;
          customer_name: string;
          items: Json;
          status?: OrderStatus;
          total_cents: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: string | null;
          paid_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
        };
        Update: {
          id?: string;
          booth_id?: string;
          order_number?: string;
          customer_name?: string;
          items?: Json;
          status?: OrderStatus;
          total_cents?: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: string | null;
          paid_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_booth_id_fkey";
            columns: ["booth_id"];
            referencedRelation: "booths";
            referencedColumns: ["id"];
          },
        ];
      };
      booth_item_sold: {
        Row: { booth_id: string; menu_item_id: string; qty: number };
        Insert: { booth_id: string; menu_item_id: string; qty?: number };
        Update: { booth_id?: string; menu_item_id?: string; qty?: number };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      next_order_number: {
        Args: { p_booth_id: string };
        Returns: string;
      };
      booth_remaining_stock: {
        Args: { p_booth_id: string };
        Returns: Json;
      };
      booth_servable: {
        Args: { p_booth_id: string };
        Returns: boolean;
      };
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      set_license_label: {
        Args: { p_license_id: string; p_label: string | null };
        Returns: undefined;
      };
      gen_short_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_booth_for_order: {
        Args: {
          p_short_code: string;
        };
        Returns: Json;
      };
      place_order: {
        Args: {
          p_short_code: string;
          p_customer_name: string;
          p_items: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      regenerate_short_code: {
        Args: {
          p_booth_id: string;
        };
        Returns: number;
      };
      submit_feedback: {
        Args: {
          p_source: string;
          p_booth_id?: string;
          p_order_number?: string;
          p_rating?: number;
          p_nps?: number;
          p_message?: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      order_status: OrderStatus;
      payment_status: PaymentStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Vendor = Database["public"]["Tables"]["vendors"]["Row"];
export type Booth = Database["public"]["Tables"]["booths"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type License = Database["public"]["Tables"]["licenses"]["Row"];
export type Pricing = Database["public"]["Tables"]["pricing"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
export type Admin = Database["public"]["Tables"]["admins"]["Row"];
export type AdminAudit = Database["public"]["Tables"]["admin_audit"]["Row"];
