import {
  Package, Boxes, FolderKanban, FileInput, FileMinus, RotateCcw,
  BarChart3, Settings, LogOut
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo-color.svg";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const allItems = [
  { title: "Pregled zalihe", url: "/", icon: Boxes, roles: ["admin", "monter"] },
  { title: "Artikli", url: "/artikli", icon: Package, roles: ["admin"] },
  { title: "Projekti", url: "/projekti", icon: FolderKanban, roles: ["admin", "monter"] },
  { title: "Nova primka", url: "/primka", icon: FileInput, roles: ["admin"] },
  { title: "Nova otpremnica", url: "/otpremnica", icon: FileMinus, roles: ["admin", "monter"] },
  { title: "Povrat materijala", url: "/povrat", icon: RotateCcw, roles: ["admin", "monter"] },
  { title: "Izvještaji", url: "/izvjestaji", icon: BarChart3, roles: ["admin"] },
  { title: "Postavke", url: "/postavke", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const role = profile?.role || "monter";
  const items = allItems.filter(i => i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}>
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-sidebar-primary">SkladišteApp</h1>
              <p className="text-xs text-sidebar-foreground/70">COREX ING d.o.o.</p>
            </div>
          )}
          {collapsed && <Boxes className="h-6 w-6 text-sidebar-primary" />}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && profile && (
          <div className="px-4 py-2 border-t">
            <p className="text-sm font-medium text-sidebar-foreground">{profile.username}</p>
            <p className="text-xs text-sidebar-foreground/60">{profile.role}</p>
          </div>
        )}
        <div className={`px-2 pb-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={signOut} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            {!collapsed && "Odjava"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
