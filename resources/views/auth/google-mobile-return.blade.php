<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Returning to Fishmap</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f5f7fb;
            color: #0f172a;
        }
        .card {
            width: min(420px, 100%);
            background: #fff;
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            padding: 24px;
            text-align: center;
        }
        h1 {
            margin: 0 0 10px;
            font-size: 20px;
        }
        p {
            margin: 0 0 16px;
            line-height: 1.45;
            color: #334155;
        }
        a.button {
            display: inline-block;
            background: #0f172a;
            color: #fff;
            text-decoration: none;
            font-weight: 600;
            border-radius: 10px;
            padding: 10px 16px;
        }
    </style>
</head>
<body>
    <main class="card">
        <h1>Returning to Fishmap</h1>
        <p>If the app does not open automatically, tap the button below.</p>
        <a class="button" href="{{ $deepLinkUrl }}">Open Fishmap</a>
    </main>

    <script>
        (function () {
            var deepLinkUrl = @json($deepLinkUrl);
            var intentUrl = @json($intentUrl);
            var isAndroid = /android/i.test(navigator.userAgent || '');

            function openApp() {
                window.location.href = deepLinkUrl;
            }

            openApp();
            window.setTimeout(openApp, 600);
            if (isAndroid) {
                window.setTimeout(function () {
                    window.location.href = intentUrl;
                }, 1200);
            }
        })();
    </script>
</body>
</html>
