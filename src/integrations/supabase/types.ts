export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          id: string
          min_quantity: number | null
          name: string
          purchase_price: number | null
          unit: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          id?: string
          min_quantity?: number | null
          name: string
          purchase_price?: number | null
          unit?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          id?: string
          min_quantity?: number | null
          name?: string
          purchase_price?: number | null
          unit?: string
        }
        Relationships: []
      }
      document_items: {
        Row: {
          article_id: string
          created_at: string | null
          document_id: string
          id: string
          note: string | null
          quantity: number
          unit: string
          unit_price: number | null
        }
        Insert: {
          article_id: string
          created_at?: string | null
          document_id: string
          id?: string
          note?: string | null
          quantity: number
          unit: string
          unit_price?: number | null
        }
        Update: {
          article_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
          note?: string | null
          quantity?: number
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "inventory_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "inventory_current_per_location"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          date: string
          doc_number: string
          id: string
          issued_by: string | null
          note: string | null
          project_id: string | null
          received_by: string | null
          recipient_address: string | null
          recipient_name: string | null
          status: string
          stock_location_id: string
          type: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          date?: string
          doc_number: string
          id?: string
          issued_by?: string | null
          note?: string | null
          project_id?: string | null
          received_by?: string | null
          recipient_address?: string | null
          recipient_name?: string | null
          status?: string
          stock_location_id: string
          type: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          date?: string
          doc_number?: string
          id?: string
          issued_by?: string | null
          note?: string | null
          project_id?: string | null
          received_by?: string | null
          recipient_address?: string | null
          recipient_name?: string | null
          status?: string
          stock_location_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_current_per_location"
            referencedColumns: ["stock_location_id"]
          },
          {
            foreignKeyName: "documents_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          article_id: string
          created_at: string | null
          created_by_user_id: string | null
          document_id: string | null
          document_item_id: string | null
          id: string
          note: string | null
          project_id: string | null
          quantity: number
          stock_location_id: string
          type: string
        }
        Insert: {
          article_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          document_id?: string | null
          document_item_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          quantity: number
          stock_location_id: string
          type: string
        }
        Update: {
          article_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          document_id?: string | null
          document_item_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          quantity?: number
          stock_location_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "inventory_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "inventory_current_per_location"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "inventory_transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_document_item_id_fkey"
            columns: ["document_item_id"]
            isOneToOne: false
            referencedRelation: "document_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_current_per_location"
            referencedColumns: ["stock_location_id"]
          },
          {
            foreignKeyName: "inventory_transactions_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role?: string
          username: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          id: string
          name: string
          note: string | null
          site_address: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          note?: string | null
          site_address?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          note?: string | null
          site_address?: string | null
          status?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          company_address: string | null
          company_city: string | null
          company_email: string | null
          company_name: string | null
          company_oib: string | null
          company_phone: string | null
          id: boolean
        }
        Insert: {
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name?: string | null
          company_oib?: string | null
          company_phone?: string | null
          id?: boolean
        }
        Update: {
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name?: string | null
          company_oib?: string | null
          company_phone?: string | null
          id?: boolean
        }
        Relationships: []
      }
      stock_locations: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      inventory_current: {
        Row: {
          category: string | null
          code: string | null
          current_qty: number | null
          current_value: number | null
          id: string | null
          min_quantity: number | null
          name: string | null
          purchase_price: number | null
          unit: string | null
        }
        Relationships: []
      }
      inventory_current_per_location: {
        Row: {
          article_id: string | null
          code: string | null
          current_qty: number | null
          location_code: string | null
          name: string | null
          purchase_price: number | null
          stock_location_id: string | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_otpremnica: {
        Args: {
          p_date?: string
          p_issued_by?: string
          p_items?: Json
          p_note?: string
          p_project_id?: string
          p_received_by?: string
          p_recipient_address?: string
          p_recipient_name?: string
          p_stock_location_id: string
        }
        Returns: Json
      }
      create_povratnica: {
        Args: {
          p_date?: string
          p_items?: Json
          p_note?: string
          p_project_id: string
          p_received_by?: string
          p_returned_by?: string
          p_stock_location_id: string
        }
        Returns: Json
      }
      create_primka: {
        Args: {
          p_date?: string
          p_items?: Json
          p_note?: string
          p_stock_location_id: string
          p_supplier?: string
        }
        Returns: Json
      }
      get_own_role: { Args: never; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
