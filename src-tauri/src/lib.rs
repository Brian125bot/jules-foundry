use rand::{distributions::Alphanumeric, Rng};
use std::{net::TcpStream, sync::{Arc, Mutex}, thread, time::Duration};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

pub fn run() {
  let service_child = Arc::new(Mutex::new(None));
  let service_child_for_setup = service_child.clone();
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      let resource_dir = app.path().resource_dir()?;
      let migration_path = resource_dir.join("drizzle-local").join("0000_open_khan.sql");
      let static_path = resource_dir.join("public");
      let native_modules = resource_dir.join("node_modules");
      let bootstrap: String = rand::thread_rng().sample_iter(&Alphanumeric).take(48).map(char::from).collect();
      let (mut receiver, child) = app.shell()
        .sidecar("foundry-service")?
        .env("NODE_ENV", "production")
        .env("FOUNDRY_OPEN_BROWSER", "false")
        .env("FOUNDRY_DESKTOP_SHELL", "true")
        .env("FOUNDRY_PORT", "31415")
        .env("FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN", &bootstrap)
        .env("FOUNDRY_MIGRATION_PATH", migration_path.to_string_lossy().to_string())
        .env("FOUNDRY_STATIC_DIR", static_path.to_string_lossy().to_string())
        .env("FOUNDRY_NATIVE_MODULES_DIR", native_modules.to_string_lossy().to_string())
        .spawn()?;
      *service_child_for_setup.lock().expect("local service child lock") = Some(child);
      tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
          if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event { eprintln!("[Foundry local service] {}", String::from_utf8_lossy(&line)); }
        }
      });
      for _ in 0..50 {
        if TcpStream::connect("127.0.0.1:31415").is_ok() { break; }
        thread::sleep(Duration::from_millis(100));
      }
      let launch = url::Url::parse(&format!("http://127.0.0.1:31415/local/bootstrap?bootstrap={}", bootstrap))?;
      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(launch))
        .title("Jules Foundry")
        .inner_size(1440.0, 960.0)
        .min_inner_size(1120.0, 720.0)
        .build()?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("unable to build Jules Foundry desktop shell")
    .run(|app, event| {
      if let RunEvent::ExitRequested { .. } = event {
        if let Ok(mut guard) = service_child.lock() {
          if let Some(child) = guard.as_mut() { let _ = child.kill(); }
          *guard = None;
        }
      }
    });
}
