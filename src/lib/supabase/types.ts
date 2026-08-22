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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appointment_items: {
        Row: {
          appointment_id: string
          id: string
          name_snapshot: string
          price: number | null
          quantity: number
          service_id: string | null
          tenant_id: string
        }
        Insert: {
          appointment_id: string
          id?: string
          name_snapshot: string
          price?: number | null
          quantity?: number
          service_id?: string | null
          tenant_id: string
        }
        Update: {
          appointment_id?: string
          id?: string
          name_snapshot?: string
          price?: number | null
          quantity?: number
          service_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          blocked_from: string
          blocked_to: string
          branch_id: string
          buffer_after_min: number
          buffer_before_min: number
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          custom_data: Json
          customer_id: string | null
          ends_at: string
          hold_expires_at: string | null
          id: string
          no_show_at: string | null
          notes: string | null
          price: number | null
          resource_id: string
          service_id: string | null
          source: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          blocked_from: string
          blocked_to: string
          branch_id: string
          buffer_after_min?: number
          buffer_before_min?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          customer_id?: string | null
          ends_at: string
          hold_expires_at?: string | null
          id?: string
          no_show_at?: string | null
          notes?: string | null
          price?: number | null
          resource_id: string
          service_id?: string | null
          source?: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          blocked_from?: string
          blocked_to?: string
          branch_id?: string
          buffer_after_min?: number
          buffer_before_min?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          customer_id?: string | null
          ends_at?: string
          hold_expires_at?: string | null
          id?: string
          no_show_at?: string | null
          notes?: string | null
          price?: number | null
          resource_id?: string
          service_id?: string | null
          source?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id?: string
        }
        Relationships: []
      }
      audit_logs_2026_08: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id?: string
        }
        Relationships: []
      }
      audit_logs_2026_09: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id?: string
        }
        Relationships: []
      }
      audit_logs_2026_10: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          tenant_id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          channel: string | null
          customer_id: string | null
          granted: boolean
          granted_at: string
          id: string
          ip: unknown
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at: string | null
          tenant_id: string
          text_version: string
          user_agent: string | null
        }
        Insert: {
          channel?: string | null
          customer_id?: string | null
          granted: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          tenant_id: string
          text_version: string
          user_agent?: string | null
        }
        Update: {
          channel?: string | null
          customer_id?: string | null
          granted?: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          kind?: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          tenant_id?: string
          text_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_medical_notes: {
        Row: {
          author_id: string | null
          body: string
          branch_id: string | null
          created_at: string
          custom_data: Json
          customer_id: string
          id: string
          resource_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          branch_id?: string | null
          created_at?: string
          custom_data?: Json
          customer_id: string
          id?: string
          resource_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          branch_id?: string | null
          created_at?: string
          custom_data?: Json
          customer_id?: string
          id?: string
          resource_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_medical_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_medical_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_medical_notes_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_medical_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birth_date: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          custom_data: Json
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          no_show_count: number
          notes: string | null
          phone: string | null
          source: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          created_at: string
          entity: Database["public"]["Enums"]["field_entity"]
          id: string
          is_medical: boolean
          is_required: boolean
          key: string
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          options: Json
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          entity: Database["public"]["Enums"]["field_entity"]
          id?: string
          is_medical?: boolean
          is_required?: boolean
          key: string
          kind?: Database["public"]["Enums"]["field_kind"]
          label: string
          options?: Json
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          entity?: Database["public"]["Enums"]["field_entity"]
          id?: string
          is_medical?: boolean
          is_required?: boolean
          key?: string
          kind?: Database["public"]["Enums"]["field_kind"]
          label?: string
          options?: Json
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          accepted_at: string | null
          assistant_of: string[]
          branch_ids: string[]
          created_at: string
          id: string
          invited_at: string | null
          is_active: boolean
          resource_id: string | null
          role_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          assistant_of?: string[]
          branch_ids?: string[]
          created_at?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          resource_id?: string | null
          role_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          assistant_of?: string[]
          branch_ids?: string[]
          created_at?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          resource_id?: string | null
          role_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          key: string
          label: string
          scopes: Database["public"]["Enums"]["permission_scope"][]
          sort_order: number
        }
        Insert: {
          category: string
          key: string
          label: string
          scopes?: Database["public"]["Enums"]["permission_scope"][]
          sort_order?: number
        }
        Update: {
          category?: string
          key?: string
          label?: string
          scopes?: Database["public"]["Enums"]["permission_scope"][]
          sort_order?: number
        }
        Relationships: []
      }
      resources: {
        Row: {
          branch_id: string
          color: string | null
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          is_bookable: boolean
          kind: Database["public"]["Enums"]["resource_kind"]
          name: string
          sort_order: number
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id: string
          color?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          kind?: Database["public"]["Enums"]["resource_kind"]
          name: string
          sort_order?: number
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          color?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          kind?: Database["public"]["Enums"]["resource_kind"]
          name?: string
          sort_order?: number
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          permission_key: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          permission_key?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_template_permissions: {
        Row: {
          permission_key: string
          role_template_key: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          permission_key: string
          role_template_key: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          permission_key?: string
          role_template_key?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_template_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_template_permissions_role_template_key_fkey"
            columns: ["role_template_key"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      role_templates: {
        Row: {
          description: string | null
          families: Database["public"]["Enums"]["business_family"][]
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          families?: Database["public"]["Enums"]["business_family"][]
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          families?: Database["public"]["Enums"]["business_family"][]
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_protected: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_protected?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_protected?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          resource_id: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          resource_id: string
          service_id: string
          tenant_id: string
        }
        Update: {
          resource_id?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_after_min: number
          buffer_before_min: number
          category: string | null
          color: string | null
          created_at: string
          custom_data: Json
          duration_min: number
          id: string
          is_active: boolean
          is_online_bookable: boolean
          name: string
          price: number | null
          sort_order: number
          tenant_id: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          buffer_after_min?: number
          buffer_before_min?: number
          category?: string | null
          color?: string | null
          created_at?: string
          custom_data?: Json
          duration_min: number
          id?: string
          is_active?: boolean
          is_online_bookable?: boolean
          name: string
          price?: number | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          buffer_after_min?: number
          buffer_before_min?: number
          category?: string | null
          color?: string | null
          created_at?: string
          custom_data?: Json
          duration_min?: number
          id?: string
          is_active?: boolean
          is_online_bookable?: boolean
          name?: string
          price?: number | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          booking_rules: Json
          branding: Json
          tenant_id: string
          terminology: Json
          updated_at: string
        }
        Insert: {
          booking_rules?: Json
          branding?: Json
          tenant_id: string
          terminology?: Json
          updated_at?: string
        }
        Update: {
          booking_rules?: Json
          branding?: Json
          tenant_id?: string
          terminology?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          business_type: string
          created_at: string
          currency: string
          family: Database["public"]["Enums"]["business_family"]
          id: string
          locale: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          business_type: string
          created_at?: string
          currency?: string
          family: Database["public"]["Enums"]["business_family"]
          id?: string
          locale?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_type?: string
          created_at?: string
          currency?: string
          family?: Database["public"]["Enums"]["business_family"]
          id?: string
          locale?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_off: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          reason: string | null
          resource_id: string
          starts_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          resource_id: string
          starts_at: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          resource_id?: string
          starts_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          branch_id: string
          created_at: string
          customer_id: string
          earliest_at: string | null
          id: string
          is_active: boolean
          latest_at: string | null
          notified_at: string | null
          resource_id: string | null
          service_id: string | null
          tenant_id: string
          weekdays: number[]
        }
        Insert: {
          branch_id: string
          created_at?: string
          customer_id: string
          earliest_at?: string | null
          id?: string
          is_active?: boolean
          latest_at?: string | null
          notified_at?: string | null
          resource_id?: string | null
          service_id?: string | null
          tenant_id: string
          weekdays?: number[]
        }
        Update: {
          branch_id?: string
          created_at?: string
          customer_id?: string
          earliest_at?: string | null
          id?: string
          is_active?: boolean
          latest_at?: string | null
          notified_at?: string | null
          resource_id?: string | null
          service_id?: string | null
          tenant_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          ends_at: string
          id: string
          resource_id: string
          starts_at: string
          tenant_id: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: string
          resource_id: string
          starts_at: string
          tenant_id: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: string
          resource_id?: string
          starts_at?: string
          tenant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_tenant_from_template: {
        Args: {
          _business_type: string
          _family: Database["public"]["Enums"]["business_family"]
          _name: string
          _payload: Json
          _slug: string
          _timezone: string
        }
        Returns: string
      }
      is_slug_available: { Args: { _slug: string }; Returns: boolean }
    }
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "arrived"
        | "completed"
        | "no_show"
        | "cancelled"
      business_family: "saglik" | "kisisel_bakim" | "hizmet"
      consent_kind:
        | "kvkk_aydinlatma"
        | "acik_riza_saglik"
        | "ticari_ileti"
        | "cerez"
      field_entity: "customer" | "appointment"
      field_kind:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "select"
        | "multiselect"
        | "boolean"
        | "phone"
      permission_scope: "own" | "branch" | "tenant"
      resource_kind: "staff" | "room" | "device"
      tenant_status: "trial" | "active" | "suspended" | "cancelled"
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
      appointment_status: [
        "pending",
        "confirmed",
        "arrived",
        "completed",
        "no_show",
        "cancelled",
      ],
      business_family: ["saglik", "kisisel_bakim", "hizmet"],
      consent_kind: [
        "kvkk_aydinlatma",
        "acik_riza_saglik",
        "ticari_ileti",
        "cerez",
      ],
      field_entity: ["customer", "appointment"],
      field_kind: [
        "text",
        "textarea",
        "number",
        "date",
        "select",
        "multiselect",
        "boolean",
        "phone",
      ],
      permission_scope: ["own", "branch", "tenant"],
      resource_kind: ["staff", "room", "device"],
      tenant_status: ["trial", "active", "suspended", "cancelled"],
    },
  },
} as const
