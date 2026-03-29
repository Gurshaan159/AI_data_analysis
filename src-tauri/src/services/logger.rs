pub fn info(message: &str) {
    println!("[INFO] {message}");
}

pub fn warn(message: &str) {
    eprintln!("[WARN] {message}");
}

pub fn error(message: &str) {
    eprintln!("[ERROR] {message}");
}
