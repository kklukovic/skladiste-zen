import {
  Package, Boxes, FolderKanban, FileInput, FileMinus, RotateCcw,
  BarChart3, Settings, Menu
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import logo from "@/assets/logo-color.svg";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Pregled zalihe", url: "/", icon: Boxes },
  { title: "Artikli", url: "/artikli", icon: Package },
  { title: "Projekti", url: "/projekti", icon: FolderKanban },
  { title: "Nova primka", url: "/primka", icon: FileInput },
  { title: "Nova otpremnica", url: "/otpremnica", icon: FileMinus },
  { title: "Povrat materijala", url: "/povrat", icon: RotateCcw },
  { title: "Izvještaji", url: "/izvjestaji", icon: BarChart3 },
  { title: "Postavke", url: "/postavke", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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
    </Sidebar>
  );
}
