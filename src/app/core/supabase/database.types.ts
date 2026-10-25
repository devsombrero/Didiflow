export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          owner_id?: string;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          color: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          owner_id?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          owner_id?: string;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_activity_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          changes: Json | null;
          created_at: string;
          id: number;
          owner_id: string;
          task_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: never;
          owner_id: string;
          task_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: never;
          owner_id?: string;
          task_id?: string;
        };
        Relationships: [];
      };
      task_status_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          from_progress: number | null;
          from_status: Database['public']['Enums']['task_status'] | null;
          id: number;
          owner_id: string;
          task_id: string;
          to_progress: number;
          to_status: Database['public']['Enums']['task_status'];
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          from_progress?: number | null;
          from_status?: Database['public']['Enums']['task_status'] | null;
          id?: never;
          owner_id: string;
          task_id: string;
          to_progress: number;
          to_status: Database['public']['Enums']['task_status'];
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          from_progress?: number | null;
          from_status?: Database['public']['Enums']['task_status'] | null;
          id?: never;
          owner_id?: string;
          task_id?: string;
          to_progress?: number;
          to_status?: Database['public']['Enums']['task_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'task_status_history_task_id_owner_id_fkey';
            columns: ['task_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'owner_id'];
          },
        ];
      };
      task_tags: {
        Row: {
          created_at: string;
          owner_id: string;
          tag_id: string;
          task_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          owner_id?: string;
          tag_id: string;
          task_id: string;
        };
        Update: {
          created_at?: string;
          owner_id?: string;
          tag_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_tags_tag_id_owner_id_fkey';
            columns: ['tag_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id', 'owner_id'];
          },
          {
            foreignKeyName: 'task_tags_task_id_owner_id_fkey';
            columns: ['task_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'owner_id'];
          },
        ];
      };
      tasks: {
        Row: {
          archived_at: string | null;
          category_id: string | null;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          due_date: string | null;
          estimated_minutes: number | null;
          has_jira_card: boolean;
          has_slack_thread: boolean;
          id: string;
          jira_url: string | null;
          notes: string | null;
          owner_id: string;
          priority: Database['public']['Enums']['task_priority'];
          progress_percentage: number;
          project_id: string | null;
          requested_at: string | null;
          requester_name: string | null;
          slack_thread_url: string | null;
          start_date: string | null;
          status: Database['public']['Enums']['task_status'];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          category_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          estimated_minutes?: number | null;
          has_jira_card?: boolean;
          has_slack_thread?: boolean;
          id?: string;
          jira_url?: string | null;
          notes?: string | null;
          owner_id?: string;
          priority?: Database['public']['Enums']['task_priority'];
          progress_percentage?: number;
          project_id?: string | null;
          requested_at?: string | null;
          requester_name?: string | null;
          slack_thread_url?: string | null;
          start_date?: string | null;
          status?: Database['public']['Enums']['task_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          category_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          estimated_minutes?: number | null;
          has_jira_card?: boolean;
          has_slack_thread?: boolean;
          id?: string;
          jira_url?: string | null;
          notes?: string | null;
          owner_id?: string;
          priority?: Database['public']['Enums']['task_priority'];
          progress_percentage?: number;
          project_id?: string | null;
          requested_at?: string | null;
          requester_name?: string | null;
          slack_thread_url?: string | null;
          start_date?: string | null;
          status?: Database['public']['Enums']['task_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_category_id_owner_id_fkey';
            columns: ['category_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id', 'owner_id'];
          },
          {
            foreignKeyName: 'tasks_project_id_owner_id_fkey';
            columns: ['project_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'owner_id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string;
          date_format: string;
          due_soon_days: number;
          notifications_enabled: boolean;
          notify_due_soon: boolean;
          notify_overdue: boolean;
          theme: Database['public']['Enums']['theme_preference'];
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date_format?: string;
          due_soon_days?: number;
          notifications_enabled?: boolean;
          notify_due_soon?: boolean;
          notify_overdue?: boolean;
          theme?: Database['public']['Enums']['theme_preference'];
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date_format?: string;
          due_soon_days?: number;
          notifications_enabled?: boolean;
          notify_due_soon?: boolean;
          notify_overdue?: boolean;
          theme?: Database['public']['Enums']['theme_preference'];
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      task_priority: 'low' | 'medium' | 'high' | 'urgent';
      task_status: 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
      theme_preference: 'system' | 'light' | 'dark';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      task_priority: ['low', 'medium', 'high', 'urgent'],
      task_status: ['not_started', 'in_progress', 'blocked', 'done', 'cancelled'],
      theme_preference: ['system', 'light', 'dark'],
    },
  },
} as const;
