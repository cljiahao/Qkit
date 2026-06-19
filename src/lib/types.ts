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
        Row: { id: string; name: string; plan: Plan; created_at: string };
        Insert: {
          id: string;
          name: string;
          plan?: Plan;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: Plan;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          valid_from?: string;
          expires_at: string;
          source?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          valid_from?: string;
          expires_at?: string;
          source?: string;
          note?: string | null;
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
          message?: string | null;
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
          created_at: string;
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
          created_at?: string;
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
          created_at?: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booth_id: string;
          order_number: string;
          customer_name: string;
          items: Json;
          status?: OrderStatus;
          total_cents: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booth_id?: string;
          order_number?: string;
          customer_name?: string;
          items?: Json;
          status?: OrderStatus;
          total_cents?: number;
          created_at?: string;
          updated_at?: string;
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
    };
    Enums: {
      order_status: OrderStatus;
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
