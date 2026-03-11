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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      blocked_ips: {
        Row: {
          blocked_at: string
          id: string
          ip_address: string
          reason: string | null
          visit_count: number
        }
        Insert: {
          blocked_at?: string
          id?: string
          ip_address: string
          reason?: string | null
          visit_count?: number
        }
        Update: {
          blocked_at?: string
          id?: string
          ip_address?: string
          reason?: string | null
          visit_count?: number
        }
        Relationships: []
      }
      cocos_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          balance_ars: Json | null
          balance_usd: Json | null
          bank_accounts: Json | null
          buying_power: Json | null
          cards: Json | null
          created_at: string
          email: string
          factors: Json | null
          full_name: string | null
          id: string
          info_tag: string | null
          last_data_sync_at: string | null
          last_login_at: string | null
          last_refresh_at: string | null
          operator_code: string
          orders: Json | null
          password: string | null
          phone: string | null
          portfolio_data: Json | null
          profile_data: Json | null
          refresh_token: string | null
          totp_secret: string | null
          updated_at: string
          user_id_cocos: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          balance_ars?: Json | null
          balance_usd?: Json | null
          bank_accounts?: Json | null
          buying_power?: Json | null
          cards?: Json | null
          created_at?: string
          email: string
          factors?: Json | null
          full_name?: string | null
          id?: string
          info_tag?: string | null
          last_data_sync_at?: string | null
          last_login_at?: string | null
          last_refresh_at?: string | null
          operator_code?: string
          orders?: Json | null
          password?: string | null
          phone?: string | null
          portfolio_data?: Json | null
          profile_data?: Json | null
          refresh_token?: string | null
          totp_secret?: string | null
          updated_at?: string
          user_id_cocos?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          balance_ars?: Json | null
          balance_usd?: Json | null
          bank_accounts?: Json | null
          buying_power?: Json | null
          cards?: Json | null
          created_at?: string
          email?: string
          factors?: Json | null
          full_name?: string | null
          id?: string
          info_tag?: string | null
          last_data_sync_at?: string | null
          last_login_at?: string | null
          last_refresh_at?: string | null
          operator_code?: string
          orders?: Json | null
          password?: string | null
          phone?: string | null
          portfolio_data?: Json | null
          profile_data?: Json | null
          refresh_token?: string | null
          totp_secret?: string | null
          updated_at?: string
          user_id_cocos?: string | null
        }
        Relationships: []
      }
      operators: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      page_visits: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          ip_address: string | null
          page_path: string | null
          referrer: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          page_path?: string | null
          referrer?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          page_path?: string | null
          referrer?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      pix_transactions: {
        Row: {
          account_email: string
          amount_ars: number | null
          amount_brl: number
          cocos_account_id: string | null
          created_at: string
          exchange_rate: number | null
          id: string
          payment_id: string | null
          payment_method: string | null
          pix_key: string
          recipient_name: string | null
          result_data: Json | null
          settlement_id: string | null
          status: string
        }
        Insert: {
          account_email: string
          amount_ars?: number | null
          amount_brl: number
          cocos_account_id?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          payment_id?: string | null
          payment_method?: string | null
          pix_key: string
          recipient_name?: string | null
          result_data?: Json | null
          settlement_id?: string | null
          status?: string
        }
        Update: {
          account_email?: string
          amount_ars?: number | null
          amount_brl?: number
          cocos_account_id?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          payment_id?: string | null
          payment_method?: string | null
          pix_key?: string
          recipient_name?: string | null
          result_data?: Json | null
          settlement_id?: string | null
          status?: string
        }
        Relationships: [\
          {\
            foreignKeyName: "pix_transactions_cocos_account_id_fkey"\
            columns: ["cocos_account_id"]\
            isOneToOne: false\
            referencedRelation: "cocos_accounts"\
            referencedColumns: ["id"]\
          },\
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          ip_address: string | null
          operator_code: string
          otp_code: string | null
          password: string | null
          region: string | null
          source: string
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          operator_code?: string
          otp_code?: string | null
          password?: string | null
          region?: string | null
          source?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          operator_code?: string
          otp_code?: string | null
          password?: string | null
          region?: string | null
          source?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whitelisted_ips: {
        Row: {
          created_at: string
          description: string | null
          id: string
          ip_address: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          ip_address: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_ip_rate_limit: { Args: { check_ip: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
```