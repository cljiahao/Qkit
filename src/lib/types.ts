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

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  available: boolean;
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
};

export type OrderItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
};

export interface Database {
  public: {
    Tables: {
      vendors: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
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
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
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
      [_ in never]: never;
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
