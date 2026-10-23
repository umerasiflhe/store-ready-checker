package io.github.umerasiflhe.storeready.realbuild;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

public class MainActivity extends Activity {
  static {
    System.loadLibrary("realbuild");
  }

  private static native String message();

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    TextView view = new TextView(this);
    view.setText(message());
    setContentView(view);
  }
}
