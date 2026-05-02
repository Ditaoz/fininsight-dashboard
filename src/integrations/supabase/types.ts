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
      analyses: {
        Row: {
          ai_opinion: string | null
          analysis_date: string
          asset_id: string | null
          asset_name: string | null
          created_at: string
          id: string
          justification: string | null
          kind: Database["public"]["Enums"]["report_kind"]
          price: number | null
          recommendation: Database["public"]["Enums"]["recommendation"] | null
          report_id: string
          risks: string[]
          strengths: string[]
          structured_data: Json
          weaknesses: string[]
        }
        Insert: {
          ai_opinion?: string | null
          analysis_date?: string
          asset_id?: string | null
          asset_name?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          kind?: Database["public"]["Enums"]["report_kind"]
          price?: number | null
          recommendation?: Database["public"]["Enums"]["recommendation"] | null
          report_id: string
          risks?: string[]
          strengths?: string[]
          structured_data?: Json
          weaknesses?: string[]
        }
        Update: {
          ai_opinion?: string | null
          analysis_date?: string
          asset_id?: string | null
          asset_name?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          kind?: Database["public"]["Enums"]["report_kind"]
          price?: number | null
          recommendation?: Database["public"]["Enums"]["recommendation"] | null
          report_id?: string
          risks?: string[]
          strengths?: string[]
          structured_data?: Json
          weaknesses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "analyses_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summaries: {
        Row: {
          alerts: Json
          analyses_count: number
          created_at: string
          id: string
          overview: string
          priorities: Json
          sentiment_by_class: Json
          summary_date: string
          updated_at: string
        }
        Insert: {
          alerts?: Json
          analyses_count?: number
          created_at?: string
          id?: string
          overview: string
          priorities?: Json
          sentiment_by_class?: Json
          summary_date: string
          updated_at?: string
        }
        Update: {
          alerts?: Json
          analyses_count?: number
          created_at?: string
          id?: string
          overview?: string
          priorities?: Json
          sentiment_by_class?: Json
          summary_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_text: string | null
          id: string
          original_filename: string
          received_at: string
          source: Database["public"]["Enums"]["report_source"]
          source_ref: string | null
          status: Database["public"]["Enums"]["report_status"]
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          original_filename: string
          received_at?: string
          source?: Database["public"]["Enums"]["report_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          original_filename?: string
          received_at?: string
          source?: Database["public"]["Enums"]["report_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_config: {
        Row: {
          bot_token: string | null
          bot_username: string | null
          enabled: boolean
          id: number
          last_error: string | null
          last_polled_at: string | null
          update_offset: number
          updated_at: string
        }
        Insert: {
          bot_token?: string | null
          bot_username?: string | null
          enabled?: boolean
          id: number
          last_error?: string | null
          last_polled_at?: string | null
          update_offset?: number
          updated_at?: string
        }
        Update: {
          bot_token?: string | null
          bot_username?: string | null
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_polled_at?: string | null
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      recommendation: "buy" | "hold" | "sell" | "monitor"
      report_kind: "fixed_income" | "stock" | "fii" | "crypto" | "other"
      report_source: "upload" | "telegram"
      report_status: "pending" | "extracting" | "analyzing" | "ready" | "failed"
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
    Enums: {
      recommendation: ["buy", "hold", "sell", "monitor"],
      report_kind: ["fixed_income", "stock", "fii", "crypto", "other"],
      report_source: ["upload", "telegram"],
      report_status: ["pending", "extracting", "analyzing", "ready", "failed"],
    },
  },
} as const
