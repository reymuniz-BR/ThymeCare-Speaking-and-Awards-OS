export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          field: string | null;
          id: string;
          new_value: string | null;
          old_value: string | null;
          opportunity_id: string | null;
          summary: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          field?: string | null;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          opportunity_id?: string | null;
          summary?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          field?: string | null;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          opportunity_id?: string | null;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_log_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      allowed_emails: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string;
          id: string;
          note: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email: string;
          id?: string;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string;
          id?: string;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allowed_emails_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brief_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          discovery_id: string | null;
          follow_up_done: boolean;
          follow_up_due: string | null;
          follow_up_note: string | null;
          follow_up_owner_id: string | null;
          id: string;
          item_key: string;
          opportunity_id: string | null;
          reviewed: boolean;
          reviewed_at: string | null;
          reviewed_by: string | null;
          section: string;
          submission_id: string | null;
          title: string | null;
          updated_at: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          discovery_id?: string | null;
          follow_up_done?: boolean;
          follow_up_due?: string | null;
          follow_up_note?: string | null;
          follow_up_owner_id?: string | null;
          id?: string;
          item_key: string;
          opportunity_id?: string | null;
          reviewed?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section: string;
          submission_id?: string | null;
          title?: string | null;
          updated_at?: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          discovery_id?: string | null;
          follow_up_done?: boolean;
          follow_up_due?: string | null;
          follow_up_note?: string | null;
          follow_up_owner_id?: string | null;
          id?: string;
          item_key?: string;
          opportunity_id?: string | null;
          reviewed?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section?: string;
          submission_id?: string | null;
          title?: string | null;
          updated_at?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brief_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brief_items_discovery_id_fkey";
            columns: ["discovery_id"];
            isOneToOne: false;
            referencedRelation: "discoveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brief_items_follow_up_owner_id_fkey";
            columns: ["follow_up_owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brief_items_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brief_items_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brief_items_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      content_assets: {
        Row: {
          category: Database["public"]["Enums"]["asset_category"];
          created_at: string;
          drive_file_id: string | null;
          extracted_text: string | null;
          folder_path: string | null;
          id: string;
          last_synced_at: string | null;
          mime_type: string | null;
          name: string;
          summary: string | null;
          tags: string[];
          updated_at: string;
          web_view_link: string | null;
        };
        Insert: {
          category?: Database["public"]["Enums"]["asset_category"];
          created_at?: string;
          drive_file_id?: string | null;
          extracted_text?: string | null;
          folder_path?: string | null;
          id?: string;
          last_synced_at?: string | null;
          mime_type?: string | null;
          name: string;
          summary?: string | null;
          tags?: string[];
          updated_at?: string;
          web_view_link?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["asset_category"];
          created_at?: string;
          drive_file_id?: string | null;
          extracted_text?: string | null;
          folder_path?: string | null;
          id?: string;
          last_synced_at?: string | null;
          mime_type?: string | null;
          name?: string;
          summary?: string | null;
          tags?: string[];
          updated_at?: string;
          web_view_link?: string | null;
        };
        Relationships: [];
      };
      content_snippets: {
        Row: {
          body: string;
          category: Database["public"]["Enums"]["asset_category"];
          created_at: string;
          created_by: string | null;
          id: string;
          source_asset_id: string | null;
          tags: string[];
          title: string;
          updated_at: string;
          usage_count: number;
        };
        Insert: {
          body: string;
          category?: Database["public"]["Enums"]["asset_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          source_asset_id?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
          usage_count?: number;
        };
        Update: {
          body?: string;
          category?: Database["public"]["Enums"]["asset_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          source_asset_id?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
          usage_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "content_snippets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_snippets_source_asset_id_fkey";
            columns: ["source_asset_id"];
            isOneToOne: false;
            referencedRelation: "content_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      discoveries: {
        Row: {
          application_url: string | null;
          categories: string[];
          confidence: string;
          created_at: string;
          description: string | null;
          duplicate_of: string | null;
          estimated_deadline: string | null;
          event_date: string | null;
          id: string;
          name: string;
          organizer: string | null;
          promoted_opportunity_id: string | null;
          rationale: string | null;
          raw_extract: Json | null;
          region: string | null;
          relevance_score: number | null;
          research_notes: string | null;
          reviewed_by: string | null;
          source: string;
          source_url: string | null;
          status: Database["public"]["Enums"]["discovery_status"];
          type: Database["public"]["Enums"]["opportunity_type"] | null;
          updated_at: string;
        };
        Insert: {
          application_url?: string | null;
          categories?: string[];
          confidence?: string;
          created_at?: string;
          description?: string | null;
          duplicate_of?: string | null;
          estimated_deadline?: string | null;
          event_date?: string | null;
          id?: string;
          name: string;
          organizer?: string | null;
          promoted_opportunity_id?: string | null;
          rationale?: string | null;
          raw_extract?: Json | null;
          region?: string | null;
          relevance_score?: number | null;
          research_notes?: string | null;
          reviewed_by?: string | null;
          source?: string;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["discovery_status"];
          type?: Database["public"]["Enums"]["opportunity_type"] | null;
          updated_at?: string;
        };
        Update: {
          application_url?: string | null;
          categories?: string[];
          confidence?: string;
          created_at?: string;
          description?: string | null;
          duplicate_of?: string | null;
          estimated_deadline?: string | null;
          event_date?: string | null;
          id?: string;
          name?: string;
          organizer?: string | null;
          promoted_opportunity_id?: string | null;
          rationale?: string | null;
          raw_extract?: Json | null;
          region?: string | null;
          relevance_score?: number | null;
          research_notes?: string | null;
          reviewed_by?: string | null;
          source?: string;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["discovery_status"];
          type?: Database["public"]["Enums"]["opportunity_type"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discoveries_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discoveries_promoted_opportunity_id_fkey";
            columns: ["promoted_opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discoveries_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      email_digest_log: {
        Row: {
          digest_key: string;
          id: string;
          item_count: number;
          recipient: string | null;
          sent_at: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          digest_key: string;
          id?: string;
          item_count?: number;
          recipient?: string | null;
          sent_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          digest_key?: string;
          id?: string;
          item_count?: number;
          recipient?: string | null;
          sent_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_digest_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      job_secrets: {
        Row: {
          created_at: string;
          name: string;
          secret: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          name: string;
          secret: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          name?: string;
          secret?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      monitoring_checks: {
        Row: {
          actor_id: string | null;
          application_state: string | null;
          changes_found: number;
          checked_at: string;
          confidence: string;
          created_at: string;
          error: string | null;
          id: string;
          ok: boolean;
          opportunity_id: string;
          raw: Json | null;
          source_url: string | null;
          summary: string | null;
          triggered_by: string;
        };
        Insert: {
          actor_id?: string | null;
          application_state?: string | null;
          changes_found?: number;
          checked_at?: string;
          confidence?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          ok?: boolean;
          opportunity_id: string;
          raw?: Json | null;
          source_url?: string | null;
          summary?: string | null;
          triggered_by?: string;
        };
        Update: {
          actor_id?: string | null;
          application_state?: string | null;
          changes_found?: number;
          checked_at?: string;
          confidence?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          ok?: boolean;
          opportunity_id?: string;
          raw?: Json | null;
          source_url?: string | null;
          summary?: string | null;
          triggered_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitoring_checks_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitoring_checks_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          opportunity_id: string | null;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          opportunity_id?: string | null;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          opportunity_id?: string | null;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunities: {
        Row: {
          announcement_date: string | null;
          application_stage: string | null;
          application_state: string | null;
          application_url: string | null;
          audience: string | null;
          category: string | null;
          change_detected: boolean;
          client_approval: string;
          client_review_due: string | null;
          cost_usd: number | null;
          created_at: string;
          created_by: string | null;
          created_from_discovery_id: string | null;
          deadline_source_url: string | null;
          deadline_time: string | null;
          deadline_timezone: string | null;
          deadline_type: string;
          deadline_verified_at: string | null;
          description: string | null;
          early_deadline: string | null;
          effort: string | null;
          event_date: string | null;
          final_deadline: string | null;
          fit_score: number | null;
          id: string;
          internal_draft_due: string | null;
          last_checked_at: string | null;
          last_verified_at: string | null;
          location: string | null;
          monitoring_enabled: boolean;
          monitoring_notes: string | null;
          name: string;
          notes: string | null;
          open_date: string | null;
          organizer: string | null;
          outcome: string | null;
          owner_id: string | null;
          owner_name: string | null;
          previous_deadline: string | null;
          priority: string;
          recommendation: string;
          region: string | null;
          source: string | null;
          status: string;
          submission_date: string | null;
          submission_owner_id: string | null;
          tags: string[];
          tier: number;
          type: Database["public"]["Enums"]["opportunity_type"];
          updated_at: string;
          url: string | null;
        };
        Insert: {
          announcement_date?: string | null;
          application_stage?: string | null;
          application_state?: string | null;
          application_url?: string | null;
          audience?: string | null;
          category?: string | null;
          change_detected?: boolean;
          client_approval?: string;
          client_review_due?: string | null;
          cost_usd?: number | null;
          created_at?: string;
          created_by?: string | null;
          created_from_discovery_id?: string | null;
          deadline_source_url?: string | null;
          deadline_time?: string | null;
          deadline_timezone?: string | null;
          deadline_type?: string;
          deadline_verified_at?: string | null;
          description?: string | null;
          early_deadline?: string | null;
          effort?: string | null;
          event_date?: string | null;
          final_deadline?: string | null;
          fit_score?: number | null;
          id?: string;
          internal_draft_due?: string | null;
          last_checked_at?: string | null;
          last_verified_at?: string | null;
          location?: string | null;
          monitoring_enabled?: boolean;
          monitoring_notes?: string | null;
          name: string;
          notes?: string | null;
          open_date?: string | null;
          organizer?: string | null;
          outcome?: string | null;
          owner_id?: string | null;
          owner_name?: string | null;
          previous_deadline?: string | null;
          priority?: string;
          recommendation?: string;
          region?: string | null;
          source?: string | null;
          status?: string;
          submission_date?: string | null;
          submission_owner_id?: string | null;
          tags?: string[];
          tier?: number;
          type?: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          announcement_date?: string | null;
          application_stage?: string | null;
          application_state?: string | null;
          application_url?: string | null;
          audience?: string | null;
          category?: string | null;
          change_detected?: boolean;
          client_approval?: string;
          client_review_due?: string | null;
          cost_usd?: number | null;
          created_at?: string;
          created_by?: string | null;
          created_from_discovery_id?: string | null;
          deadline_source_url?: string | null;
          deadline_time?: string | null;
          deadline_timezone?: string | null;
          deadline_type?: string;
          deadline_verified_at?: string | null;
          description?: string | null;
          early_deadline?: string | null;
          effort?: string | null;
          event_date?: string | null;
          final_deadline?: string | null;
          fit_score?: number | null;
          id?: string;
          internal_draft_due?: string | null;
          last_checked_at?: string | null;
          last_verified_at?: string | null;
          location?: string | null;
          monitoring_enabled?: boolean;
          monitoring_notes?: string | null;
          name?: string;
          notes?: string | null;
          open_date?: string | null;
          organizer?: string | null;
          outcome?: string | null;
          owner_id?: string | null;
          owner_name?: string | null;
          previous_deadline?: string | null;
          priority?: string;
          recommendation?: string;
          region?: string | null;
          source?: string | null;
          status?: string;
          submission_date?: string | null;
          submission_owner_id?: string | null;
          tags?: string[];
          tier?: number;
          type?: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunities_created_from_discovery_id_fkey";
            columns: ["created_from_discovery_id"];
            isOneToOne: false;
            referencedRelation: "discoveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunities_submission_owner_id_fkey";
            columns: ["submission_owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_changes: {
        Row: {
          check_id: string | null;
          confidence: string;
          created_at: string;
          detected_at: string;
          evidence: string | null;
          field: string;
          id: string;
          label: string;
          new_value: string | null;
          old_value: string | null;
          opportunity_id: string;
          review_status: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_url: string | null;
          updated_at: string;
        };
        Insert: {
          check_id?: string | null;
          confidence?: string;
          created_at?: string;
          detected_at?: string;
          evidence?: string | null;
          field: string;
          id?: string;
          label: string;
          new_value?: string | null;
          old_value?: string | null;
          opportunity_id: string;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_url?: string | null;
          updated_at?: string;
        };
        Update: {
          check_id?: string | null;
          confidence?: string;
          created_at?: string;
          detected_at?: string;
          evidence?: string | null;
          field?: string;
          id?: string;
          label?: string;
          new_value?: string | null;
          old_value?: string | null;
          opportunity_id?: string;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_changes_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_changes_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_changes_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_cycles: {
        Row: {
          created_at: string;
          id: string;
          is_current: boolean;
          label: string | null;
          opportunity_id: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          label?: string | null;
          opportunity_id: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          label?: string | null;
          opportunity_id?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_cycles_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_dates: {
        Row: {
          confidence: string;
          created_at: string;
          cycle_id: string | null;
          date: string;
          id: string;
          kind: Database["public"]["Enums"]["date_kind"];
          last_verified_at: string | null;
          note: string | null;
          opportunity_id: string;
          updated_at: string;
        };
        Insert: {
          confidence?: string;
          created_at?: string;
          cycle_id?: string | null;
          date: string;
          id?: string;
          kind: Database["public"]["Enums"]["date_kind"];
          last_verified_at?: string | null;
          note?: string | null;
          opportunity_id: string;
          updated_at?: string;
        };
        Update: {
          confidence?: string;
          created_at?: string;
          cycle_id?: string | null;
          date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["date_kind"];
          last_verified_at?: string | null;
          note?: string | null;
          opportunity_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_dates_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_dates_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      proof_points: {
        Row: {
          approved: boolean;
          approved_at: string | null;
          approved_by: string | null;
          content: string;
          created_at: string;
          created_by: string | null;
          executive_name: string | null;
          expires_on: string | null;
          id: string;
          kind: Database["public"]["Enums"]["proof_point_kind"];
          last_verified_at: string | null;
          notes: string | null;
          source: string | null;
          source_date: string | null;
          source_url: string | null;
          speaker_id: string | null;
          tags: string[];
          theme: string | null;
          title: string;
          updated_at: string;
          usage_count: number;
        };
        Insert: {
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          executive_name?: string | null;
          expires_on?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["proof_point_kind"];
          last_verified_at?: string | null;
          notes?: string | null;
          source?: string | null;
          source_date?: string | null;
          source_url?: string | null;
          speaker_id?: string | null;
          tags?: string[];
          theme?: string | null;
          title: string;
          updated_at?: string;
          usage_count?: number;
        };
        Update: {
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          executive_name?: string | null;
          expires_on?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["proof_point_kind"];
          last_verified_at?: string | null;
          notes?: string | null;
          source?: string | null;
          source_date?: string | null;
          source_url?: string | null;
          speaker_id?: string | null;
          tags?: string[];
          theme?: string | null;
          title?: string;
          updated_at?: string;
          usage_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proof_points_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proof_points_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proof_points_speaker_id_fkey";
            columns: ["speaker_id"];
            isOneToOne: false;
            referencedRelation: "speakers";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_views: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_views_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      speakers: {
        Row: {
          availability: string | null;
          bio: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_external: boolean;
          organization: string | null;
          photo_url: string | null;
          title: string | null;
          topics: string[];
          updated_at: string;
        };
        Insert: {
          availability?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_external?: boolean;
          organization?: string | null;
          photo_url?: string | null;
          title?: string | null;
          topics?: string[];
          updated_at?: string;
        };
        Update: {
          availability?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_external?: boolean;
          organization?: string | null;
          photo_url?: string | null;
          title?: string | null;
          topics?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      submission_answer_versions: {
        Row: {
          alternate: Json | null;
          answer: string;
          char_count: number;
          created_at: string;
          created_by: string | null;
          field_id: string;
          id: string;
          is_final: boolean;
          model: string | null;
          note: string | null;
          origin: string;
          reusable: boolean;
          sources: Json;
          submission_id: string;
          updated_at: string;
          verifications: Json;
          version: number;
          word_count: number;
        };
        Insert: {
          alternate?: Json | null;
          answer?: string;
          char_count?: number;
          created_at?: string;
          created_by?: string | null;
          field_id: string;
          id?: string;
          is_final?: boolean;
          model?: string | null;
          note?: string | null;
          origin?: string;
          reusable?: boolean;
          sources?: Json;
          submission_id: string;
          updated_at?: string;
          verifications?: Json;
          version?: number;
          word_count?: number;
        };
        Update: {
          alternate?: Json | null;
          answer?: string;
          char_count?: number;
          created_at?: string;
          created_by?: string | null;
          field_id?: string;
          id?: string;
          is_final?: boolean;
          model?: string | null;
          note?: string | null;
          origin?: string;
          reusable?: boolean;
          sources?: Json;
          submission_id?: string;
          updated_at?: string;
          verifications?: Json;
          version?: number;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "submission_answer_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_answer_versions_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "submission_fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_answer_versions_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_briefs: {
        Row: {
          brief: Json;
          created_at: string;
          generated_by: string | null;
          id: string;
          model: string | null;
          opportunity_id: string | null;
          sources: Json;
          submission_id: string;
          updated_at: string;
        };
        Insert: {
          brief?: Json;
          created_at?: string;
          generated_by?: string | null;
          id?: string;
          model?: string | null;
          opportunity_id?: string | null;
          sources?: Json;
          submission_id: string;
          updated_at?: string;
        };
        Update: {
          brief?: Json;
          created_at?: string;
          generated_by?: string | null;
          id?: string;
          model?: string | null;
          opportunity_id?: string | null;
          sources?: Json;
          submission_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_briefs_generated_by_fkey";
            columns: ["generated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_briefs_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_briefs_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_fields: {
        Row: {
          answer: string;
          char_limit: number | null;
          created_at: string;
          id: string;
          position: number;
          prompt: string;
          reused_from_asset_id: string | null;
          reused_from_field_id: string | null;
          submission_id: string;
          updated_at: string;
          word_limit: number | null;
        };
        Insert: {
          answer?: string;
          char_limit?: number | null;
          created_at?: string;
          id?: string;
          position?: number;
          prompt: string;
          reused_from_asset_id?: string | null;
          reused_from_field_id?: string | null;
          submission_id: string;
          updated_at?: string;
          word_limit?: number | null;
        };
        Update: {
          answer?: string;
          char_limit?: number | null;
          created_at?: string;
          id?: string;
          position?: number;
          prompt?: string;
          reused_from_asset_id?: string | null;
          reused_from_field_id?: string | null;
          submission_id?: string;
          updated_at?: string;
          word_limit?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "submission_fields_reused_from_field_id_fkey";
            columns: ["reused_from_field_id"];
            isOneToOne: false;
            referencedRelation: "submission_fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_fields_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_speakers: {
        Row: {
          role: string | null;
          speaker_id: string;
          submission_id: string;
        };
        Insert: {
          role?: string | null;
          speaker_id: string;
          submission_id: string;
        };
        Update: {
          role?: string | null;
          speaker_id?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_speakers_speaker_id_fkey";
            columns: ["speaker_id"];
            isOneToOne: false;
            referencedRelation: "speakers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_speakers_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          assignee_id: string | null;
          created_at: string;
          created_by: string | null;
          cycle_id: string | null;
          id: string;
          opportunity_id: string;
          outcome: string | null;
          outcome_notes: string | null;
          reviewer_id: string | null;
          stage: Database["public"]["Enums"]["submission_stage"];
          submitted_at: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          cycle_id?: string | null;
          id?: string;
          opportunity_id: string;
          outcome?: string | null;
          outcome_notes?: string | null;
          reviewer_id?: string | null;
          stage?: Database["public"]["Enums"]["submission_stage"];
          submitted_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          cycle_id?: string | null;
          id?: string;
          opportunity_id?: string;
          outcome?: string | null;
          outcome_notes?: string | null;
          reviewer_id?: string | null;
          stage?: Database["public"]["Enums"]["submission_stage"];
          submitted_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_options: {
        Row: {
          applies_to: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          kind: string;
          label: string;
          sort_order: number;
          tone: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          applies_to?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind: string;
          label: string;
          sort_order?: number;
          tone?: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          applies_to?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          label?: string;
          sort_order?: number;
          tone?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      webhook_runs: {
        Row: {
          created_at: string;
          last_run_at: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          last_run_at?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          last_run_at?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_manage: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_team_member: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "admin" | "manager" | "contributor" | "viewer";
      asset_category:
        "bio" | "boilerplate" | "prior_application" | "metrics" | "case_study" | "press" | "other";
      date_kind:
        "opens" | "deadline" | "extended_deadline" | "notification" | "event_start" | "event_end";
      discovery_status: "new" | "reviewed" | "promoted" | "dismissed" | "researching" | "duplicate";
      opportunity_status:
        | "prospect"
        | "tracking"
        | "in_progress"
        | "submitted"
        | "shortlisted"
        | "won"
        | "lost"
        | "declined"
        | "archived";
      opportunity_type: "award" | "speaking" | "conference" | "recognition";
      proof_point_kind:
        | "company_overview"
        | "differentiation"
        | "market_problem"
        | "innovation_story"
        | "healthcare_impact"
        | "patient_impact"
        | "customer_impact"
        | "growth_metric"
        | "business_metric"
        | "technology_narrative"
        | "value_based_care"
        | "executive_bio"
        | "leadership_example"
        | "customer_example"
        | "milestone"
        | "award_recognition"
        | "approved_quote";
      submission_stage:
        "draft" | "in_review" | "approved" | "submitted" | "outcome_pending" | "won" | "lost";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "contributor", "viewer"],
      asset_category: [
        "bio",
        "boilerplate",
        "prior_application",
        "metrics",
        "case_study",
        "press",
        "other",
      ],
      date_kind: [
        "opens",
        "deadline",
        "extended_deadline",
        "notification",
        "event_start",
        "event_end",
      ],
      discovery_status: ["new", "reviewed", "promoted", "dismissed", "researching", "duplicate"],
      opportunity_status: [
        "prospect",
        "tracking",
        "in_progress",
        "submitted",
        "shortlisted",
        "won",
        "lost",
        "declined",
        "archived",
      ],
      opportunity_type: ["award", "speaking", "conference", "recognition"],
      proof_point_kind: [
        "company_overview",
        "differentiation",
        "market_problem",
        "innovation_story",
        "healthcare_impact",
        "patient_impact",
        "customer_impact",
        "growth_metric",
        "business_metric",
        "technology_narrative",
        "value_based_care",
        "executive_bio",
        "leadership_example",
        "customer_example",
        "milestone",
        "award_recognition",
        "approved_quote",
      ],
      submission_stage: [
        "draft",
        "in_review",
        "approved",
        "submitted",
        "outcome_pending",
        "won",
        "lost",
      ],
    },
  },
} as const;
